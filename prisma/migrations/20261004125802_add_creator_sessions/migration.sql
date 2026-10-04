-- CreateTable
CREATE TABLE "CreatorSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorSession_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorSession_tokenHash_key" ON "CreatorSession"("tokenHash");

-- CreateIndex
CREATE INDEX "CreatorSession_creatorId_idx" ON "CreatorSession"("creatorId");

-- CreateIndex
CREATE INDEX "CreatorSession_expiresAt_idx" ON "CreatorSession"("expiresAt");
