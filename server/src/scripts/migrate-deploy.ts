import { spawnSync } from "node:child_process";
import {
  ensureDatabaseFile,
  getDatabaseConfiguration,
  loadDatabaseEnvironment,
  repositoryRoot,
} from "../config/database.js";

loadDatabaseEnvironment();
const environment = process.env;
const database = getDatabaseConfiguration(environment);
ensureDatabaseFile(database.path, environment);

const result = spawnSync(
  "pnpm",
  ["exec", "prisma", "migrate", "deploy", "--config", "prisma7.config.ts"],
  { cwd: repositoryRoot, env: environment, stdio: "inherit" },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
