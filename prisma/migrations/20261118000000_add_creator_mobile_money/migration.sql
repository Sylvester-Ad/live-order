CREATE TABLE "CreatorMobileMoneySettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "mobileMoneyNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreatorMobileMoneySettings_creatorId_fkey"
        FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CreatorMobileMoneySettings_creatorId_key"
ON "CreatorMobileMoneySettings"("creatorId");

ALTER TABLE "Order"
ADD COLUMN "mobileMoneyProvider" TEXT;

ALTER TABLE "Order"
ADD COLUMN "mobileMoneyNumber" TEXT;

ALTER TABLE "Order"
ADD COLUMN "mobileMoneyAccountName" TEXT;
