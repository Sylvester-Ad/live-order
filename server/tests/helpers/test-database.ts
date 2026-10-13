import { prisma } from "../../src/database/prisma.js";

if (process.env.LIVEORDER_DATABASE_PATH !== "../data/test.db") {
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
