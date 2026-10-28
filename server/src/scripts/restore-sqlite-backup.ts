import path from "node:path";
import {
  getDatabaseConfiguration,
  loadDatabaseEnvironment,
} from "../config/database.js";
import { restoreSqliteBackup } from "../modules/backups/sqlite-backups.js";

function requiredOption(name: string) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function main() {
  loadDatabaseEnvironment();
  const source = path.resolve(requiredOption("--source"));
  const destination = path.resolve(requiredOption("--destination"));
  const activeDatabasePath = getDatabaseConfiguration().path;

  await restoreSqliteBackup(source, destination, {
    replaceExisting: process.argv.includes("--replace-existing"),
    activeDatabasePath,
  });
  console.log("SQLite backup restored and verified.");
}

main().catch((error: unknown) => {
  console.error(`Restore failed: ${error instanceof Error ? error.message : "unexpected error"}`);
  process.exitCode = 1;
});
