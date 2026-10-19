import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

const serverDirectory = path.resolve(scriptDirectory, "../..");
const repositoryRoot = path.resolve(serverDirectory, "..");

const databaseDirectory = path.join(repositoryRoot, "data");
const databasePath = path.join(databaseDirectory, "test.db");

mkdirSync(databaseDirectory, { recursive: true });

console.log(`Preparing test database: ${databasePath}`);

const result = spawnSync(
  "pnpm",
  ["exec", "prisma", "migrate", "deploy"],
  {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: "file:./data/test.db",
      LIVEORDER_DATABASE_PATH: "../data/test.db",
      NODE_ENV: "test",
    },
  },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("Test database is ready.");
