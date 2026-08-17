-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Address" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "label" TEXT,
    "contact" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "emirate" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'AE',
    "country" TEXT NOT NULL DEFAULT 'United Arab Emirates',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Address_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Address" ("city", "contact", "country", "createdAt", "emirate", "id", "isArchived", "isDefault", "label", "line1", "line2", "organisationId", "phone") SELECT "city", "contact", "country", "createdAt", "emirate", "id", "isArchived", "isDefault", "label", "line1", "line2", "organisationId", "phone" FROM "Address";
DROP TABLE "Address";
ALTER TABLE "new_Address" RENAME TO "Address";
CREATE INDEX "Address_organisationId_idx" ON "Address"("organisationId");
CREATE TABLE "new_Organisation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "trn" TEXT,
    "phone" TEXT,
    "emirate" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'AE',
    "paymentTerms" TEXT NOT NULL DEFAULT 'Prepaid',
    "creditLimitFils" INTEGER NOT NULL DEFAULT 0,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Organisation" ("createdAt", "creditLimitFils", "emirate", "id", "isDisabled", "name", "notes", "paymentTerms", "phone", "trn", "updatedAt") SELECT "createdAt", "creditLimitFils", "emirate", "id", "isDisabled", "name", "notes", "paymentTerms", "phone", "trn", "updatedAt" FROM "Organisation";
DROP TABLE "Organisation";
ALTER TABLE "new_Organisation" RENAME TO "Organisation";
CREATE TABLE "new_Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "companyName" TEXT NOT NULL,
    "primaryEmail" TEXT NOT NULL,
    "secondaryEmail" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'AE',
    "emirate" TEXT,
    "trn" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "promisedLeadTimeDays" INTEGER,
    "ackSlaHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Supplier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Supplier" ("ackSlaHours", "address", "companyName", "createdAt", "id", "isAvailable", "phone", "primaryEmail", "promisedLeadTimeDays", "secondaryEmail", "status", "trn", "updatedAt", "userId") SELECT "ackSlaHours", "address", "companyName", "createdAt", "id", "isAvailable", "phone", "primaryEmail", "promisedLeadTimeDays", "secondaryEmail", "status", "trn", "updatedAt", "userId" FROM "Supplier";
DROP TABLE "Supplier";
ALTER TABLE "new_Supplier" RENAME TO "Supplier";
CREATE UNIQUE INDEX "Supplier_userId_key" ON "Supplier"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
