-- CreateTable
CREATE TABLE "AccountChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Applied',
    "payload" TEXT,
    "targetId" TEXT,
    "requestedByUserId" TEXT,
    "requestedByName" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" DATETIME,
    "decisionNote" TEXT,
    CONSTRAINT "AccountChange_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountChange_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccountChange_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AccountChange_organisationId_requestedAt_idx" ON "AccountChange"("organisationId", "requestedAt");

-- CreateIndex
CREATE INDEX "AccountChange_status_idx" ON "AccountChange"("status");

-- CreateIndex
CREATE INDEX "AccountChange_targetId_idx" ON "AccountChange"("targetId");
