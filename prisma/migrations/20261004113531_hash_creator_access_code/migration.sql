/*
  Warnings:

  - You are about to drop the column `accessCode` on the `Creator` table. All the data in the column will be lost.
  - Added the required column `accessCodeHash` to the `Creator` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Creator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "accessCodeHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Creator" ("createdAt", "id", "name", "updatedAt") SELECT "createdAt", "id", "name", "updatedAt" FROM "Creator";
DROP TABLE "Creator";
ALTER TABLE "new_Creator" RENAME TO "Creator";
CREATE UNIQUE INDEX "Creator_accessCodeHash_key" ON "Creator"("accessCodeHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
