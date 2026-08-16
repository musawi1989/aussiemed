-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "audience" TEXT NOT NULL DEFAULT 'Admin',
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "entity" TEXT,
    "entityId" TEXT,
    "readAt" DATETIME,
    "emailedAt" DATETIME,
    "emailedTo" TEXT,
    "outboundEmailId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Notification_audience_readAt_createdAt_idx" ON "Notification"("audience", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_entity_entityId_idx" ON "Notification"("entity", "entityId");

-- CreateIndex
CREATE INDEX "Notification_kind_idx" ON "Notification"("kind");
