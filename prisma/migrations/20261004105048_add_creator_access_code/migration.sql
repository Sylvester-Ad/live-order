/*
  Warnings:

  - Added the required column `accessCode` to the `Creator` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Creator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "accessCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Creator" ("createdAt", "id", "name", "updatedAt") SELECT "createdAt", "id", "name", "updatedAt" FROM "Creator";
DROP TABLE "Creator";
ALTER TABLE "new_Creator" RENAME TO "Creator";
CREATE UNIQUE INDEX "Creator_accessCode_key" ON "Creator"("accessCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
