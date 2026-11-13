CREATE TABLE "ProductCreationRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idempotencyKey" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "liveId" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "productId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductCreationRequest_creatorId_fkey"
        FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductCreationRequest_liveId_fkey"
        FOREIGN KEY ("liveId") REFERENCES "Live" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductCreationRequest_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductCreationRequest_idempotencyKey_key"
    ON "ProductCreationRequest"("idempotencyKey");
CREATE UNIQUE INDEX "ProductCreationRequest_productId_key"
    ON "ProductCreationRequest"("productId");
CREATE INDEX "ProductCreationRequest_creatorId_liveId_idx"
    ON "ProductCreationRequest"("creatorId", "liveId");
