CREATE TEMP TABLE "_ProductImageSlotsPreflight" (
    "valid" INTEGER NOT NULL CHECK ("valid" = 1)
);

INSERT INTO "_ProductImageSlotsPreflight" ("valid")
SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM "ProductImage"
    GROUP BY "productId"
    HAVING COUNT(*) > 3
) THEN 0 ELSE 1 END;

DROP TABLE "_ProductImageSlotsPreflight";

ALTER TABLE "Product"
ADD COLUMN "imageSlotsUsed" INTEGER NOT NULL DEFAULT 0
CHECK ("imageSlotsUsed" >= 0 AND "imageSlotsUsed" <= 3);

ALTER TABLE "Product"
ADD COLUMN "isDeleting" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ProductImageUploadRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idempotencyKey" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "liveId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fileFingerprint" TEXT NOT NULL
        CHECK (length("fileFingerprint") = 64 AND "fileFingerprint" NOT GLOB '*[^0-9a-f]*'),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "storageId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ProductImageUploadRequest_idempotencyKey_key"
ON "ProductImageUploadRequest"("idempotencyKey");

CREATE INDEX "ProductImageUploadRequest_productId_status_idx"
ON "ProductImageUploadRequest"("productId", "status");

ALTER TABLE "ProductImage"
ADD COLUMN "state" TEXT NOT NULL DEFAULT 'ACTIVE'
CHECK ("state" IN ('ACTIVE', 'DELETING'));

ALTER TABLE "ProductImage"
ADD COLUMN "uploadRequestId" TEXT
REFERENCES "ProductImageUploadRequest"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ProductImage_uploadRequestId_key"
ON "ProductImage"("uploadRequestId");

CREATE INDEX "ProductImage_productId_state_idx"
ON "ProductImage"("productId", "state");

-- Existing rows have no lifecycle state in the previous schema, so preserve
-- them as ACTIVE and count them. A product with more than three rows fails
-- this constrained backfill instead of silently dropping or undercounting data.
UPDATE "Product"
SET "imageSlotsUsed" = (
    SELECT COUNT(*)
    FROM "ProductImage"
    WHERE "ProductImage"."productId" = "Product"."id"
      AND "ProductImage"."state" = 'ACTIVE'
);
