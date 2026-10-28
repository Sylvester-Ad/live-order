import { defineConfig } from "prisma/config";
import { getDatabaseConfiguration, loadDatabaseEnvironment } from "./server/src/config/database.js";

loadDatabaseEnvironment();
const isClientGeneration = process.argv.includes("generate");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: getDatabaseConfiguration(process.env, {
      requireProductionPath: !isClientGeneration,
    }).url,
  },
});
