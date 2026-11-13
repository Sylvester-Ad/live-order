import Database from "better-sqlite3";
import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../../../prisma/migrations/20261111120000_add_product_image_slots_and_upload_requests/migration.sql",
  import.meta.url,
);
const database = new Database(":memory:");

afterEach(() => {
  database.exec("DROP TABLE IF EXISTS temp._ProductImageSlotsPreflight");
  database.exec("DROP TABLE IF EXISTS ProductImageUploadRequest");
  database.exec("DROP TABLE IF EXISTS ProductImage");
  database.exec("DROP TABLE IF EXISTS Product");
});

describe("product image slot migration", () => {
  it("backfills zero, one, and multiple legacy image rows without changing primaries", () => {
    database.exec(`
      CREATE TABLE Product (id TEXT NOT NULL PRIMARY KEY);
      CREATE TABLE ProductImage (
        id TEXT NOT NULL PRIMARY KEY,
        productId TEXT NOT NULL,
        url TEXT NOT NULL,
        storageId TEXT NOT NULL,
        provider TEXT NOT NULL,
        isPrimary BOOLEAN NOT NULL DEFAULT true,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL,
        FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX ProductImage_one_primary_idx
        ON ProductImage(productId) WHERE isPrimary = true;
      INSERT INTO Product(id) VALUES ('zero'), ('one'), ('multiple');
      INSERT INTO ProductImage(id, productId, url, storageId, provider, isPrimary, updatedAt)
        VALUES ('image-one', 'one', 'url-one', 'storage-one', 'CLOUDINARY', true, CURRENT_TIMESTAMP);
      INSERT INTO ProductImage(id, productId, url, storageId, provider, isPrimary, updatedAt)
        VALUES
          ('image-multiple-primary', 'multiple', 'url-primary', 'storage-primary', 'CLOUDINARY', true, CURRENT_TIMESTAMP),
          ('image-multiple-secondary', 'multiple', 'url-secondary', 'storage-secondary', 'CLOUDINARY', false, CURRENT_TIMESTAMP);
    `);

    database.exec(fs.readFileSync(migrationUrl, "utf8"));

    expect(database.prepare("SELECT id, imageSlotsUsed FROM Product ORDER BY id").all()).toEqual([
      { id: "multiple", imageSlotsUsed: 2 },
      { id: "one", imageSlotsUsed: 1 },
      { id: "zero", imageSlotsUsed: 0 },
    ]);
    expect(database.prepare("SELECT id, isPrimary, state FROM ProductImage ORDER BY id").all()).toEqual([
      { id: "image-multiple-primary", isPrimary: 1, state: "ACTIVE" },
      { id: "image-multiple-secondary", isPrimary: 0, state: "ACTIVE" },
      { id: "image-one", isPrimary: 1, state: "ACTIVE" },
    ]);
  });

  it("fails rather than undercounting a legacy product with more than three images", () => {
    database.exec(`
      CREATE TABLE Product (id TEXT NOT NULL PRIMARY KEY);
      CREATE TABLE ProductImage (
        id TEXT NOT NULL PRIMARY KEY,
        productId TEXT NOT NULL,
        url TEXT NOT NULL,
        storageId TEXT NOT NULL,
        provider TEXT NOT NULL,
        isPrimary BOOLEAN NOT NULL DEFAULT true,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL,
        FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX ProductImage_one_primary_idx
        ON ProductImage(productId) WHERE isPrimary = true;
      INSERT INTO Product(id) VALUES ('over-limit');
      INSERT INTO ProductImage(id, productId, url, storageId, provider, isPrimary, updatedAt)
        VALUES
          ('primary', 'over-limit', 'url-primary', 'storage-primary', 'CLOUDINARY', true, CURRENT_TIMESTAMP),
          ('secondary-one', 'over-limit', 'url-one', 'storage-one', 'CLOUDINARY', false, CURRENT_TIMESTAMP),
          ('secondary-two', 'over-limit', 'url-two', 'storage-two', 'CLOUDINARY', false, CURRENT_TIMESTAMP),
          ('secondary-three', 'over-limit', 'url-three', 'storage-three', 'CLOUDINARY', false, CURRENT_TIMESTAMP);
    `);

    expect(() => database.exec(fs.readFileSync(migrationUrl, "utf8"))).toThrow(/CHECK constraint failed/);
    expect(database.prepare("SELECT COUNT(*) AS count FROM ProductImage WHERE productId = 'over-limit'").get())
      .toEqual({ count: 4 });
    expect(database.prepare("PRAGMA table_info(Product)").all().map((column: { name: string }) => column.name))
      .toEqual(["id"]);
    expect(database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ProductImageUploadRequest'",
    ).get()).toBeUndefined();
  });
});
