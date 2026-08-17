-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "organisationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("appliedAt", "approvalStatus", "approvedAt", "approvedBy", "authProvider", "createdAt", "email", "googleSubject", "id", "isDisabled", "isVerified", "name", "organisationId", "otpCode", "otpExpiresAt", "passwordHash", "phone", "rejectedReason", "role", "updatedAt", "username") SELECT "appliedAt", "approvalStatus", "approvedAt", "approvedBy", "authProvider", "createdAt", "email", "googleSubject", "id", "isDisabled", "isVerified", "name", "organisationId", "otpCode", "otpExpiresAt", "passwordHash", "phone", "rejectedReason", "role", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_googleSubject_key" ON "User"("googleSubject");
CREATE INDEX "User_organisationId_idx" ON "User"("organisationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
