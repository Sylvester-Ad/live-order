import { prisma } from "../../src/database/prisma.js";
import { getDatabaseConfiguration } from "../../src/config/database.js";

const testDatabasePath = process.env.LIVEORDER_TEST_DATABASE_PATH?.trim() ?? "./data/test.db";
if (getDatabaseConfiguration().path !== getDatabaseConfiguration({
  ...process.env,
  LIVEORDER_DATABASE_PATH: testDatabasePath,
  NODE_ENV: "test",
}).path) {
  throw new Error(
    "Refusing to clean the database: test database is not configured",
  );
}

export async function resetTestDatabase() {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.live.deleteMany();
  await prisma.creatorSession.deleteMany();
  await prisma.creator.deleteMany();
}
