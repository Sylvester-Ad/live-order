-- Add customer-facing references without changing existing order or customer data.
ALTER TABLE "Order" ADD COLUMN "reference" TEXT;

-- Existing orders also need a usable reference. SQLite's randomblob creates
-- a 64-bit value; the unique index below verifies the backfill.
UPDATE "Order"
SET "reference" = 'ORD-' || upper(hex(randomblob(8)))
WHERE "reference" IS NULL;

CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");
