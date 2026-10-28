import path from "node:path";
import {
  finalizeLocalBackupUpload,
  getLocalBackupDirectory,
  isManagedBackupPath,
} from "../modules/backups/local-backup-retention.js";
import { verifySqliteDatabase } from "../modules/backups/sqlite-backups.js";
import { getDatabaseConfiguration, loadDatabaseEnvironment } from "../config/database.js";

function getBackupPath() {
  const index = process.argv.indexOf("--backup");
  const value = process.argv[index + 1];
  if (index === -1 || !value || value.startsWith("--")) {
    throw new Error("Usage: finalize-sqlite-backup-upload --backup <verified-backup-file> [--validate-only]");
  }
  return path.resolve(value);
}

async function main() {
  loadDatabaseEnvironment();
  const databasePath = getDatabaseConfiguration().path;
  const backupDirectory = getLocalBackupDirectory(databasePath);
  const backupPath = getBackupPath();
  if (!isManagedBackupPath(backupPath, backupDirectory)) {
    throw new Error("Backup file must be inside the dedicated LiveOrder backup directory");
  }
  verifySqliteDatabase(backupPath);

  if (process.argv.includes("--validate-only")) {
    console.log("SQLite backup is valid and ready for upload.");
    return;
  }

  const result = await finalizeLocalBackupUpload(backupPath, backupDirectory, databasePath);
  if (!result.cleanupSucceeded) {
    throw new Error("Remote upload succeeded, but local backup state could not be updated");
  }
  console.log("Successful backup upload recorded locally.");
}

main().catch((error: unknown) => {
  console.error(`Backup finalization failed: ${error instanceof Error ? error.message : "unexpected error"}`);
  process.exitCode = 1;
});
