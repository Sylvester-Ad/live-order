import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function findRepositoryRoot(startDirectory: string) {
  let currentDirectory = startDirectory;

  while (true) {
    if (fs.existsSync(path.join(currentDirectory, "prisma", "schema.prisma"))) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      throw new Error("Could not locate the LiveOrder repository root from the server module");
    }
    currentDirectory = parentDirectory;
  }
}

export const repositoryRoot = findRepositoryRoot(path.dirname(fileURLToPath(import.meta.url)));

export function loadDatabaseEnvironment() {
  dotenv.config({ path: path.join(repositoryRoot, ".env") });
}

export function getDatabaseConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
  options: { requireProductionPath?: boolean } = {},
) {
  const configuredPath = environment.LIVEORDER_DATABASE_PATH?.trim();
  const isProduction = environment.NODE_ENV === "production";
  const requireProductionPath = options.requireProductionPath ?? true;

  if (configuredPath?.includes("\0")) {
    throw new Error("LIVEORDER_DATABASE_PATH contains an invalid character");
  }

  if (isProduction && requireProductionPath && !configuredPath) {
    throw new Error("LIVEORDER_DATABASE_PATH must be set to an absolute path in production");
  }

  if (isProduction && requireProductionPath && configuredPath && !path.isAbsolute(configuredPath)) {
    throw new Error("LIVEORDER_DATABASE_PATH must be an absolute path in production");
  }

  const databasePath = configuredPath
    ? path.resolve(repositoryRoot, configuredPath)
    : path.join(repositoryRoot, "data", "dev.db");
  const parentDirectory = path.dirname(databasePath);

  if (!isProduction) {
    fs.mkdirSync(parentDirectory, { recursive: true });
  }

  return {
    path: databasePath,
    url: pathToFileURL(databasePath).href.replace(/^file:\/\/\//, "file:/"),
  };
}

export function ensureDatabaseFile(
  databasePath: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const parentDirectory = path.dirname(databasePath);
  const isProduction = environment.NODE_ENV === "production";

  if (fs.existsSync(databasePath) && !fs.statSync(databasePath).isFile()) {
    throw new Error("LIVEORDER_DATABASE_PATH must name a SQLite database file");
  }

  if (isProduction) {
    if (!fs.existsSync(parentDirectory) || !fs.statSync(parentDirectory).isDirectory()) {
      throw new Error("The directory for LIVEORDER_DATABASE_PATH must exist on persistent storage");
    }
  } else {
    fs.mkdirSync(parentDirectory, { recursive: true });
  }

  const fileDescriptor = fs.openSync(databasePath, "a", 0o600);
  fs.closeSync(fileDescriptor);
}

