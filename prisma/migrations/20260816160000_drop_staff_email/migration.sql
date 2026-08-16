/*
  Warnings:

  - You are about to drop the column `email` on the `OrganisationStaff` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrganisationStaff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganisationStaff_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OrganisationStaff" ("createdAt", "id", "isActive", "name", "organisationId") SELECT "createdAt", "id", "isActive", "name", "organisationId" FROM "OrganisationStaff";
DROP TABLE "OrganisationStaff";
ALTER TABLE "new_OrganisationStaff" RENAME TO "OrganisationStaff";
CREATE INDEX "OrganisationStaff_organisationId_idx" ON "OrganisationStaff"("organisationId");
CREATE UNIQUE INDEX "OrganisationStaff_organisationId_name_key" ON "OrganisationStaff"("organisationId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
