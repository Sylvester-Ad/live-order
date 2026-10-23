import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDatabaseFile, getDatabaseConfiguration } from "../config/database.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

const serverDirectory = path.resolve(scriptDirectory, "../..");
const repositoryRoot = path.resolve(serverDirectory, "..");

const databasePath = path.join(repositoryRoot, "data", "test.db");

const testEnvironment = {
  ...process.env,
  LIVEORDER_DATABASE_PATH: databasePath,
  NODE_ENV: "test",
};
ensureDatabaseFile(getDatabaseConfiguration(testEnvironment).path, testEnvironment);

console.log(`Preparing test database: ${databasePath}`);

const result = spawnSync(
  "pnpm",
  ["exec", "prisma", "migrate", "deploy"],
  {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: testEnvironment,
  },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("Test database is ready.");
