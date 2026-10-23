import { beforeAll, afterAll } from "vitest";
import path from "node:path";
import { repositoryRoot } from "../src/config/database.js";

process.env.LIVEORDER_DATABASE_PATH = path.join(repositoryRoot, "data", "test.db");

beforeAll(() => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Integration tests must not run in production");
  }
});

afterAll(async () => {
  const { prisma } = await import("../src/database/prisma.js");
  await prisma.$disconnect();
});
