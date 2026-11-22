CREATE TABLE "StoreMobileMoneySettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "mobileMoneyNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "origin" TEXT NOT NULL DEFAULT 'STORE_MANAGED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreMobileMoneySettings_storeId_fkey"
        FOREIGN KEY ("storeId") REFERENCES "Live" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StoreMobileMoneySettings_storeId_key"
ON "StoreMobileMoneySettings"("storeId");

INSERT INTO "StoreMobileMoneySettings" (
    "id",
    "storeId",
    "provider",
    "mobileMoneyNumber",
    "accountName",
    "enabled",
    "origin",
    "createdAt",
    "updatedAt"
)
SELECT
    lower(hex(randomblob(4))) || '-' ||
        lower(hex(randomblob(2))) || '-4' ||
        substr(lower(hex(randomblob(2))), 2) || '-' ||
        substr('89ab', (random() & 3) + 1, 1) ||
        substr(lower(hex(randomblob(2))), 2) || '-' ||
        lower(hex(randomblob(6))),
    "Live"."id",
    "CreatorMobileMoneySettings"."provider",
    "CreatorMobileMoneySettings"."mobileMoneyNumber",
    "CreatorMobileMoneySettings"."accountName",
    "CreatorMobileMoneySettings"."enabled",
    'LEGACY_INHERITED',
    "CreatorMobileMoneySettings"."createdAt",
    "CreatorMobileMoneySettings"."updatedAt"
FROM "Live"
INNER JOIN "CreatorMobileMoneySettings"
    ON "CreatorMobileMoneySettings"."creatorId" = "Live"."creatorId";
