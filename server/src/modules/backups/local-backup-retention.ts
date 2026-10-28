import fs from "node:fs/promises";
import path from "node:path";

export const LOCAL_BACKUP_RETENTION_DAYS = 14;
export const MAX_PENDING_LOCAL_BACKUPS = 7;

const backupNamePattern = /^liveorder-\d{8}T\d{6}Z(?:-[a-zA-Z0-9-]+)?\.sqlite$/;

export function getLocalBackupDirectory(databasePath: string) {
  return path.join(path.dirname(path.resolve(databasePath)), "backups");
}

export function assertManagedBackupPath(backupPath: string, backupDirectory: string) {
  const absoluteBackupPath = path.resolve(backupPath);
  if (
    path.dirname(absoluteBackupPath) !== path.resolve(backupDirectory)
    || !backupNamePattern.test(path.basename(absoluteBackupPath))
  ) {
    throw new Error("Backup file must use a LiveOrder backup filename in the dedicated backup directory");
  }
  return absoluteBackupPath;
}

export function isManagedBackupPath(backupPath: string, backupDirectory: string) {
  const absoluteBackupPath = path.resolve(backupPath);
  return path.dirname(absoluteBackupPath) === path.resolve(backupDirectory)
    && backupNamePattern.test(path.basename(absoluteBackupPath));
}

function markerPath(backupPath: string) {
  return path.join(path.dirname(backupPath), `.${path.basename(backupPath)}.uploaded`);
}

async function isRegularFile(filePath: string) {
  const info = await fs.lstat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  return info?.isFile() ?? false;
}

async function isSameFile(firstPath: string, secondPath: string) {
  const [firstRealPath, secondRealPath] = await Promise.all([
    fs.realpath(firstPath).catch(() => undefined),
    fs.realpath(secondPath).catch(() => undefined),
  ]);
  if (firstRealPath && secondRealPath && firstRealPath === secondRealPath) return true;
  const [firstInfo, secondInfo] = await Promise.all([
    fs.stat(firstPath).catch(() => undefined),
    fs.stat(secondPath).catch(() => undefined),
  ]);
  return Boolean(firstInfo && secondInfo && firstInfo.dev === secondInfo.dev && firstInfo.ino === secondInfo.ino);
}

async function readManagedBackups(backupDirectory: string) {
  const directory = path.resolve(backupDirectory);
  const directoryInfo = await fs.lstat(directory);
  if (!directoryInfo.isDirectory()) {
    throw new Error("The dedicated backup path must be a real directory");
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && backupNamePattern.test(entry.name))
    .map((entry) => path.join(directory, entry.name));
}

export async function assertPendingBackupCapacity(backupDirectory: string) {
  const backups = await readManagedBackups(backupDirectory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  let pendingCount = 0;
  for (const backupPath of backups) {
    if (!await isRegularFile(markerPath(backupPath))) pendingCount += 1;
  }
  if (pendingCount >= MAX_PENDING_LOCAL_BACKUPS) {
    throw new Error(
      `There are already ${pendingCount} unuploaded local backups; retry or resolve them before creating another`,
    );
  }
}

export async function markLocalBackupUploaded(backupPath: string, backupDirectory: string) {
  const managedPath = assertManagedBackupPath(backupPath, backupDirectory);
  if (!await isRegularFile(managedPath)) throw new Error("Uploaded backup file is missing or is not a regular file");

  const marker = markerPath(managedPath);
  try {
    await fs.writeFile(marker, new Date().toISOString(), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST" && await isRegularFile(marker))) {
      throw error;
    }
  }
}

export async function pruneUploadedLocalBackups(
  backupDirectory: string,
  options: { activeDatabasePath: string; now?: Date; retentionDays?: number },
) {
  const backups = await readManagedBackups(backupDirectory);
  const cutoff = (options.now ?? new Date()).getTime()
    - (options.retentionDays ?? LOCAL_BACKUP_RETENTION_DAYS) * 24 * 60 * 60 * 1000;
  let removedCount = 0;

  for (const backupPath of backups) {
    const marker = markerPath(backupPath);
    if (!await isRegularFile(marker)) continue;
    if (await isSameFile(backupPath, options.activeDatabasePath)) {
      throw new Error("Refusing to remove the configured active SQLite database from the backup directory");
    }

    const info = await fs.stat(backupPath);
    if (info.mtimeMs >= cutoff) continue;

    await fs.unlink(marker);
    await fs.unlink(backupPath);
    removedCount += 1;
  }
  return removedCount;
}

export async function finalizeLocalBackupUpload(
  backupPath: string,
  backupDirectory: string,
  activeDatabasePath: string,
  logger: Pick<Console, "error"> = console,
) {
  try {
    await markLocalBackupUploaded(backupPath, backupDirectory);
    const removedCount = await pruneUploadedLocalBackups(backupDirectory, { activeDatabasePath });
    return { cleanupSucceeded: true, removedCount };
  } catch (error) {
    logger.error(
      `S3 upload succeeded, but local backup retention cleanup failed: ${error instanceof Error ? error.message : "unexpected error"}`,
    );
    return { cleanupSucceeded: false, removedCount: 0 };
  }
}
