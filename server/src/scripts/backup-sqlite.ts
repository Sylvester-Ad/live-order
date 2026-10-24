import path from "node:path";
import { createS3BackupSender, getS3BackupConfiguration, uploadSqliteBackup } from "../modules/backups/s3-backups.js";
import {
  assertManagedBackupPath,
  assertPendingBackupCapacity,
  finalizeLocalBackupUpload,
  getLocalBackupDirectory,
} from "../modules/backups/local-backup-retention.js";
import { createSqliteBackup } from "../modules/backups/sqlite-backups.js";
import { getDatabaseConfiguration, loadDatabaseEnvironment } from "../config/database.js";

function option(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function main() {
  loadDatabaseEnvironment();
  const source = path.resolve(option("--source") ?? getDatabaseConfiguration().path);
  const destination = option("--destination");
  if (!destination) throw new Error("Usage: backup-sqlite --destination <backup-file> [--source <database-file>] [--upload]");
  const databasePath = getDatabaseConfiguration().path;
  const backupDirectory = getLocalBackupDirectory(databasePath);
  const backupPath = assertManagedBackupPath(path.resolve(destination), backupDirectory);
  await assertPendingBackupCapacity(backupDirectory);

  await createSqliteBackup(source, backupPath);
  console.log("SQLite backup created and verified.");

  if (process.argv.includes("--upload")) {
    const configuration = getS3BackupConfiguration();
    const { S3Client } = await import("@aws-sdk/client-s3");
    const client = new S3Client({ region: configuration.region });
    try {
      const key = await uploadSqliteBackup(backupPath, configuration, createS3BackupSender(client));
      console.log(`Verified backup uploaded to s3://${configuration.bucket}/${key}`);
      await finalizeLocalBackupUpload(backupPath, backupDirectory, databasePath);
    } finally {
      client.destroy();
    }
  }
}

main().catch((error: unknown) => {
  console.error(`Backup failed: ${error instanceof Error ? error.message : "unexpected error"}`);
  process.exitCode = 1;
});
