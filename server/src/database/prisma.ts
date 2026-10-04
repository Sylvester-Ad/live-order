import dotenv from "dotenv";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../../generated/prisma/client.js";

dotenv.config({
  path: path.resolve(process.cwd(), "../.env"),
});

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const adapter = new PrismaBetterSqlite3({
  url: connectionString,
});

export const prisma = new PrismaClient({
  adapter,
});
