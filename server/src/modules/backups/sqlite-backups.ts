import Database from "better-sqlite3";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const requiredTables = [
  "Creator",
  "CreatorSession",
  "Live",
  "Product",
  "ProductImage",
  "Order",
  "OrderItem",
  "_prisma_migrations",
] as const;

type IntegrityRow = { integrity_check: string };
type TableRow = { name: string };
type ForeignKeyViolation = { table: string; rowid: number | null; parent: string; fkid: number };

// These signature columns cover the fields needed to identify the current
// application schema without duplicating Prisma's complete model definitions.
const requiredColumns: Record<(typeof requiredTables)[number], readonly string[]> = {
  Creator: ["id", "name", "accessCodeHash"],
  CreatorSession: ["id", "creatorId", "tokenHash", "expiresAt"],
  Live: ["id", "creatorId", "name", "slug", "status"],
  Product: ["id", "liveId", "name", "price", "stockQuantity"],
  ProductImage: ["id", "productId", "url", "storageId", "provider"],
  Order: ["id", "liveId", "customerName", "totalAmount", "paymentStatus"],
  OrderItem: ["id", "orderId", "productId", "productName", "unitPrice", "quantity"],
  _prisma_migrations: ["id", "checksum", "migration_name", "started_at", "finished_at"],
};

function openExistingDatabase(databasePath: string) {
  return new Database(databasePath, { readonly: true, fileMustExist: true });
}

function verifyOpenDatabase(database: Database.Database) {
  const integrity = database.pragma("integrity_check") as IntegrityRow[];
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
    throw new Error("SQLite integrity check failed");
  }

  const tables = new Set(
    (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as TableRow[])
      .map(({ name }) => name),
  );
  const missingTables = requiredTables.filter((table) => !tables.has(table));
  if (missingTables.length > 0) {
    throw new Error("SQLite database does not contain the expected LiveOrder schema");
  }

  for (const [table, columns] of Object.entries(requiredColumns)) {
    const presentColumns = new Set(
      (database.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>)
        .map(({ name }) => name),
    );
    if (columns.some((column) => !presentColumns.has(column))) {
      throw new Error("SQLite database does not contain the expected LiveOrder schema");
    }
  }

  const foreignKeyViolations = database.pragma("foreign_key_check") as ForeignKeyViolation[];
  if (foreignKeyViolations.length > 0) {
    throw new Error("SQLite database contains foreign-key violations");
  }
}

export function verifySqliteDatabase(databasePath: string) {
  let database: Database.Database | undefined;
  try {
    database = openExistingDatabase(path.resolve(databasePath));
    verifyOpenDatabase(database);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SQLite ")) throw error;
    throw new Error("Could not open or verify the SQLite database", { cause: error });
  } finally {
    database?.close();
  }
}

export async function createSqliteBackup(sourcePath: string, destinationPath: string) {
  const source = path.resolve(sourcePath);
  const destination = path.resolve(destinationPath);
  if (source === destination) throw new Error("Backup source and destination must be different files");

  await fs.mkdir(path.dirname(destination), { recursive: true });
  const reservation = await fs.open(destination, "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") throw new Error("Backup destination already exists");
    throw new Error("Could not create the backup destination", { cause: error });
  });
  await reservation.close();

  let sourceDatabase: Database.Database | undefined;
  try {
    sourceDatabase = openExistingDatabase(source);
    verifyOpenDatabase(sourceDatabase);
    await sourceDatabase.backup(destination);
    await fs.chmod(destination, 0o600);
    verifySqliteDatabase(destination);
    return destination;
  } catch (error) {
    await fs.rm(destination, { force: true }).catch(() => undefined);
    if (error instanceof Error) throw error;
    throw new Error("SQLite backup failed");
  } finally {
    sourceDatabase?.close();
  }
}

export async function restoreSqliteBackup(
  backupPath: string,
  destinationPath: string,
  options: { replaceExisting?: boolean; activeDatabasePath?: string } = {},
) {
  const source = path.resolve(backupPath);
  const destination = path.resolve(destinationPath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  if (await pathsReferToSameFile(source, destination)) {
    throw new Error("Restore source and destination must be different files");
  }
  if (options.activeDatabasePath && await pathsReferToSameFile(options.activeDatabasePath, destination)) {
    throw new Error("Restore destination cannot be the configured active database");
  }

  verifySqliteDatabase(source);

  const existing = await fs.lstat(destination).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (existing && !options.replaceExisting) {
    throw new Error("Restore destination already exists; pass --replace-existing to replace it");
  }
  if (existing && !existing.isFile()) throw new Error("Restore destination must be a regular file");
  for (const suffix of ["-wal", "-shm"]) {
    const sidecarPath = `${destination}${suffix}`;
    const sidecarExists = await fs.lstat(sidecarPath).then(() => true).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    });
    if (sidecarExists) {
      throw new Error("Restore destination has SQLite sidecar files; stop database access and retry");
    }
  }

  const temporaryPath = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.restore-${randomUUID()}.tmp`,
  );
  try {
    await fs.copyFile(source, temporaryPath, fsConstants.COPYFILE_EXCL);
    await fs.chmod(temporaryPath, 0o600);
    verifySqliteDatabase(temporaryPath);
    if (options.replaceExisting) {
      await fs.rename(temporaryPath, destination);
    } else {
      await fs.link(temporaryPath, destination);
      await fs.unlink(temporaryPath);
    }
    return destination;
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    if (error instanceof Error) throw error;
    throw new Error("SQLite restore failed");
  }
}

async function canonicalPath(databasePath: string) {
  const absolutePath = path.resolve(databasePath);
  try {
    return await fs.realpath(absolutePath);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    const realParent = await fs.realpath(path.dirname(absolutePath));
    return path.join(realParent, path.basename(absolutePath));
  }
}

async function pathsReferToSameFile(firstPath: string, secondPath: string) {
  const [firstCanonical, secondCanonical] = await Promise.all([
    canonicalPath(firstPath),
    canonicalPath(secondPath),
  ]);
  if (firstCanonical === secondCanonical) return true;

  const [firstStat, secondStat] = await Promise.all([
    fs.stat(firstPath).catch(() => undefined),
    fs.stat(secondPath).catch(() => undefined),
  ]);
  return Boolean(
    firstStat && secondStat && firstStat.dev === secondStat.dev && firstStat.ino === secondStat.ino,
  );
}
