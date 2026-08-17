-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Organisation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "trn" TEXT,
    "phone" TEXT,
    "emirate" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'AE',
    "isSelfRegistered" BOOLEAN NOT NULL DEFAULT false,
    "paymentTerms" TEXT NOT NULL DEFAULT 'Prepaid',
    "creditLimitFils" INTEGER NOT NULL DEFAULT 0,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Organisation" ("countryCode", "createdAt", "creditLimitFils", "emirate", "id", "isDisabled", "name", "notes", "paymentTerms", "phone", "trn", "updatedAt") SELECT "countryCode", "createdAt", "creditLimitFils", "emirate", "id", "isDisabled", "name", "notes", "paymentTerms", "phone", "trn", "updatedAt" FROM "Organisation";
DROP TABLE "Organisation";
ALTER TABLE "new_Organisation" RENAME TO "Organisation";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'Customer',
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" TEXT NOT NULL DEFAULT 'Approved',
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "rejectedReason" TEXT,
    "appliedAt" DATETIME,
    "authProvider" TEXT NOT NULL DEFAULT 'Password',
    "googleSubject" TEXT,
    "otpCode" TEXT,
    "otpExpiresAt" DATETIME,
    "organisationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "id", "isDisabled", "isVerified", "name", "organisationId", "otpCode", "otpExpiresAt", "passwordHash", "phone", "role", "updatedAt", "username") SELECT "createdAt", "email", "id", "isDisabled", "isVerified", "name", "organisationId", "otpCode", "otpExpiresAt", "passwordHash", "phone", "role", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_googleSubject_key" ON "User"("googleSubject");
CREATE INDEX "User_organisationId_idx" ON "User"("organisationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
