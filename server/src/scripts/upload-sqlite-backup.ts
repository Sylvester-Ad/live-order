import { S3Client } from "@aws-sdk/client-s3";
import path from "node:path";
import { createS3BackupSender, getS3BackupConfiguration, uploadSqliteBackup } from "../modules/backups/s3-backups.js";
import {
  finalizeLocalBackupUpload,
  getLocalBackupDirectory,
  isManagedBackupPath,
} from "../modules/backups/local-backup-retention.js";
import { getDatabaseConfiguration, loadDatabaseEnvironment } from "../config/database.js";

async function main() {
  loadDatabaseEnvironment();
  const backupArgument = process.argv.indexOf("--backup");
  const backupPath = process.argv[backupArgument + 1];
  if (backupArgument === -1 || !backupPath || backupPath.startsWith("--")) {
    throw new Error("Usage: upload-sqlite-backup --backup <verified-backup-file>");
  }

  const configuration = getS3BackupConfiguration();
  const databasePath = getDatabaseConfiguration().path;
  const backupDirectory = getLocalBackupDirectory(databasePath);
  const client = new S3Client({ region: configuration.region });
  try {
    const key = await uploadSqliteBackup(
      path.resolve(backupPath),
      configuration,
      createS3BackupSender(client),
    );
    console.log(`Verified backup uploaded to s3://${configuration.bucket}/${key}`);
    if (isManagedBackupPath(path.resolve(backupPath), backupDirectory)) {
      await finalizeLocalBackupUpload(path.resolve(backupPath), backupDirectory, databasePath);
    }
  } finally {
    client.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(`Backup upload failed: ${error instanceof Error ? error.message : "unexpected error"}`);
  process.exitCode = 1;
});
