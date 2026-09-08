-- More than one admin, and a master admin who decides what the others reach.

-- The one account that cannot be locked out of anything.
ALTER TABLE "User" ADD COLUMN "isMasterAdmin" BOOLEAN NOT NULL DEFAULT false;

-- STORED AS DENIALS, NOT GRANTS. A row means "this person may not"; its
-- absence means they may. So a section added next month is available to
-- everyone who already had an account, rather than a deploy silently removing
-- access from people who had it.
CREATE TABLE "AdminPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByName" TEXT NOT NULL,
    CONSTRAINT "AdminPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AdminPermission_userId_key_key" ON "AdminPermission"("userId", "key");
CREATE INDEX "AdminPermission_userId_idx" ON "AdminPermission"("userId");

-- Somebody has to hold the keys on the first run, or the console that grants
-- them cannot be opened by anyone. The longest-standing admin is promoted,
-- which on every existing installation is the account that set the system up.
UPDATE "User"
   SET "isMasterAdmin" = true
 WHERE "id" = (
   SELECT "id" FROM "User"
    WHERE "role" = 'Admin' AND "isDisabled" = false
    ORDER BY "createdAt" ASC
    LIMIT 1
 );
