ALTER TABLE "Creator" ADD COLUMN "email" TEXT;
ALTER TABLE "Creator" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "Creator" ADD COLUMN "emailVerifiedAt" DATETIME;

CREATE UNIQUE INDEX "Creator_email_key" ON "Creator"("email");

CREATE TABLE "CreatorAuthToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "pendingEmail" TEXT NOT NULL,
    "pendingPasswordHash" TEXT NOT NULL,
    "pendingName" TEXT,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorAuthToken_creatorId_fkey"
        FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CreatorAuthToken_creatorId_key" ON "CreatorAuthToken"("creatorId");
CREATE UNIQUE INDEX "CreatorAuthToken_pendingEmail_key" ON "CreatorAuthToken"("pendingEmail");
CREATE UNIQUE INDEX "CreatorAuthToken_tokenHash_key" ON "CreatorAuthToken"("tokenHash");
CREATE INDEX "CreatorAuthToken_expiresAt_idx" ON "CreatorAuthToken"("expiresAt");

CREATE TABLE "CreatorPasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorPasswordResetToken_creatorId_fkey"
        FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CreatorPasswordResetToken_tokenHash_key" ON "CreatorPasswordResetToken"("tokenHash");
CREATE INDEX "CreatorPasswordResetToken_creatorId_expiresAt_idx" ON "CreatorPasswordResetToken"("creatorId", "expiresAt");
CREATE INDEX "CreatorPasswordResetToken_expiresAt_idx" ON "CreatorPasswordResetToken"("expiresAt");
