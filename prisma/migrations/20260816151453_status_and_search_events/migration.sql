-- CreateTable
CREATE TABLE "StatusEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityRef" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT NOT NULL DEFAULT 'System',
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StatusEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SearchEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "term" TEXT NOT NULL,
    "normalised" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "categoryScope" TEXT,
    "userId" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StatusEvent_entity_entityId_at_idx" ON "StatusEvent"("entity", "entityId", "at");

-- CreateIndex
CREATE INDEX "StatusEvent_entity_toStatus_idx" ON "StatusEvent"("entity", "toStatus");

-- CreateIndex
CREATE INDEX "StatusEvent_at_idx" ON "StatusEvent"("at");

-- CreateIndex
CREATE INDEX "SearchEvent_normalised_idx" ON "SearchEvent"("normalised");

-- CreateIndex
CREATE INDEX "SearchEvent_resultCount_at_idx" ON "SearchEvent"("resultCount", "at");

-- CreateIndex
CREATE INDEX "SearchEvent_at_idx" ON "SearchEvent"("at");
