-- Existing products start unavailable until the creator enters a stock count.
ALTER TABLE "Product"
ADD COLUMN "stockQuantity" INTEGER NOT NULL DEFAULT 0
CHECK ("stockQuantity" >= 0 AND "stockQuantity" <= 2147483647);

CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storageId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductImage_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");
CREATE INDEX "ProductImage_productId_isPrimary_idx" ON "ProductImage"("productId", "isPrimary");

-- The data model permits multiple product images, while enforcing one primary image.
CREATE UNIQUE INDEX "ProductImage_one_primary_idx"
ON "ProductImage"("productId")
WHERE "isPrimary" = true;
