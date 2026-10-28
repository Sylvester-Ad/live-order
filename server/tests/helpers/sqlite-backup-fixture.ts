import Database from "better-sqlite3";
import path from "node:path";

export function createLiveOrderSqliteFixture(directory: string, filename = "source.db") {
  const databasePath = path.join(directory, filename);
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE "Creator" (
      "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "accessCodeHash" TEXT NOT NULL UNIQUE
    );
    CREATE TABLE "CreatorSession" (
      "id" TEXT PRIMARY KEY, "creatorId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE,
      "expiresAt" DATETIME NOT NULL,
      FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE
    );
    CREATE TABLE "Live" (
      "id" TEXT PRIMARY KEY, "creatorId" TEXT NOT NULL, "name" TEXT NOT NULL,
      "slug" TEXT NOT NULL UNIQUE, "status" TEXT NOT NULL,
      FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE CASCADE
    );
    CREATE TABLE "Product" (
      "id" TEXT PRIMARY KEY, "liveId" TEXT NOT NULL, "name" TEXT NOT NULL,
      "price" INTEGER NOT NULL, "stockQuantity" INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY ("liveId") REFERENCES "Live"("id") ON DELETE CASCADE
    );
    CREATE TABLE "ProductImage" (
      "id" TEXT PRIMARY KEY, "productId" TEXT NOT NULL, "url" TEXT NOT NULL,
      "storageId" TEXT NOT NULL, "provider" TEXT NOT NULL,
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE
    );
    CREATE TABLE "Order" (
      "id" TEXT PRIMARY KEY, "liveId" TEXT NOT NULL, "customerName" TEXT NOT NULL,
      "totalAmount" INTEGER NOT NULL, "paymentStatus" TEXT NOT NULL,
      FOREIGN KEY ("liveId") REFERENCES "Live"("id") ON DELETE CASCADE
    );
    CREATE TABLE "OrderItem" (
      "id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL, "productId" TEXT NOT NULL,
      "productName" TEXT NOT NULL, "unitPrice" INTEGER NOT NULL, "quantity" INTEGER NOT NULL,
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE,
      FOREIGN KEY ("productId") REFERENCES "Product"("id")
    );
    CREATE TABLE "_prisma_migrations" (
      "id" TEXT PRIMARY KEY, "checksum" TEXT NOT NULL, "migration_name" TEXT NOT NULL,
      "started_at" DATETIME NOT NULL, "finished_at" DATETIME
    );
  `);
  database.prepare('INSERT INTO "Creator" ("id", "name", "accessCodeHash") VALUES (?, ?, ?)')
    .run("fixture-id", "Fixture creator", "fixture-hash");
  database.close();
  return databasePath;
}
