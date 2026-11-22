import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  new URL("../../../prisma/migrations/20261121000000_add_store_mobile_money_settings/migration.sql", import.meta.url),
  "utf8",
);
const hasNativeSqliteBinding = (() => {
  try {
    new Database(":memory:").close();
    return true;
  } catch {
    return false;
  }
})();

describe("Store Mobile Money migration backfill", () => {
  let database: Database.Database | undefined;

  afterEach(() => {
    database?.close();
    database = undefined;
  });

  it.skipIf(!hasNativeSqliteBinding)("copies settings to every existing Store without changing orders or orphaning empty creators", () => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec(`
      CREATE TABLE "Creator" (
        "id" TEXT PRIMARY KEY NOT NULL
      );
      CREATE TABLE "Live" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "creatorId" TEXT NOT NULL REFERENCES "Creator"("id") ON DELETE CASCADE
      );
      CREATE TABLE "CreatorMobileMoneySettings" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "creatorId" TEXT NOT NULL UNIQUE REFERENCES "Creator"("id") ON DELETE CASCADE,
        "provider" TEXT NOT NULL,
        "mobileMoneyNumber" TEXT NOT NULL,
        "accountName" TEXT NOT NULL,
        "enabled" BOOLEAN NOT NULL,
        "createdAt" DATETIME NOT NULL,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE TABLE "Order" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "liveId" TEXT NOT NULL,
        "mobileMoneyProvider" TEXT,
        "mobileMoneyNumber" TEXT,
        "mobileMoneyAccountName" TEXT,
        "paymentStatus" TEXT NOT NULL,
        "reference" TEXT NOT NULL,
        "totalAmount" INTEGER NOT NULL
      );

      INSERT INTO "Creator" ("id") VALUES ('creator-many'), ('creator-none'), ('creator-no-stores');
      INSERT INTO "Live" ("id", "creatorId") VALUES
        ('store-a', 'creator-many'),
        ('store-b', 'creator-many'),
        ('store-no-settings', 'creator-none');
      INSERT INTO "CreatorMobileMoneySettings" (
        "id", "creatorId", "provider", "mobileMoneyNumber", "accountName", "enabled", "createdAt", "updatedAt"
      ) VALUES (
        'legacy-disabled', 'creator-many', 'AT_MONEY', '0271234567', 'Legacy Account', 0, 'created', 'updated'
      ), (
        'legacy-no-store', 'creator-no-stores', 'MTN_MOBILE_MONEY', '0241234567', 'No Store Account', 1, 'created2', 'updated2'
      );
      INSERT INTO "Order" (
        "id", "liveId", "mobileMoneyProvider", "mobileMoneyNumber", "mobileMoneyAccountName", "paymentStatus", "reference", "totalAmount"
      ) VALUES ('historical-order', 'store-a', 'MTN_MOBILE_MONEY', '0247654321', 'Snapshot Account', 'PAID', 'ORD-123', 1250);
    `);

    const orderBefore = database.prepare('SELECT * FROM "Order" WHERE "id" = ?').get("historical-order");
    database.exec(migrationSql);

    const copied = database.prepare(`
      SELECT "storeId", "provider", "mobileMoneyNumber", "accountName", "enabled", "origin"
      FROM "StoreMobileMoneySettings" ORDER BY "storeId"
    `).all();
    expect(copied).toEqual([
      {
        storeId: "store-a",
        provider: "AT_MONEY",
        mobileMoneyNumber: "0271234567",
        accountName: "Legacy Account",
        enabled: 0,
        origin: "LEGACY_INHERITED",
      },
      {
        storeId: "store-b",
        provider: "AT_MONEY",
        mobileMoneyNumber: "0271234567",
        accountName: "Legacy Account",
        enabled: 0,
        origin: "LEGACY_INHERITED",
      },
    ]);

    const settingsCount = database.prepare('SELECT COUNT(*) AS count FROM "StoreMobileMoneySettings"').get() as { count: number };
    expect(settingsCount.count).toBe(2);
    expect(database.prepare('SELECT * FROM "CreatorMobileMoneySettings" WHERE "id" = ?').get("legacy-no-store")).toMatchObject({
      id: "legacy-no-store",
      creatorId: "creator-no-stores",
    });
    expect(database.prepare('SELECT * FROM "Order" WHERE "id" = ?').get("historical-order")).toEqual(orderBefore);
    expect(database.pragma("foreign_key_check")).toEqual([]);
  });
});
