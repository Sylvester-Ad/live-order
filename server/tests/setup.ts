import { beforeAll, afterAll } from "vitest";

process.env.LIVEORDER_DATABASE_PATH = "../data/test.db";

beforeAll(() => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Integration tests must not run in production");
  }
});

afterAll(async () => {
  const { prisma } = await import("../src/database/prisma.js");
  await prisma.$disconnect();
});