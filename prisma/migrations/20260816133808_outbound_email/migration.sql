-- CreateTable
CREATE TABLE "OutboundEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Queued',
    "driver" TEXT NOT NULL,
    "error" TEXT,
    "entity" TEXT,
    "entityId" TEXT,
    "dedupeKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboundEmail_dedupeKey_key" ON "OutboundEmail"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboundEmail_status_queuedAt_idx" ON "OutboundEmail"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "OutboundEmail_entity_entityId_idx" ON "OutboundEmail"("entity", "entityId");

-- CreateIndex
CREATE INDEX "OutboundEmail_kind_idx" ON "OutboundEmail"("kind");
