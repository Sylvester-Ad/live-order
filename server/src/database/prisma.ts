import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../../generated/prisma/client.js";
import { getDatabaseConfiguration, loadDatabaseEnvironment } from "../config/database.js";

loadDatabaseEnvironment();
const databaseConfiguration = getDatabaseConfiguration();

const adapter = new PrismaBetterSqlite3({
  url: databaseConfiguration.url,
});

export const prisma = new PrismaClient({
  adapter,
});
