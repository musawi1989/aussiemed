ALTER TABLE "MessageTemplate" ADD COLUMN "html" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "html" TEXT;
ALTER TABLE "SavedEmailTemplate" ADD COLUMN "html" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "paymentTermsDays" INTEGER;
ALTER TABLE "User" ADD COLUMN "emailSignatureHtml" TEXT;

CREATE TABLE "EmailAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BLOB NOT NULL,
    FOREIGN KEY ("emailId") REFERENCES "OutboundEmail" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EmailAttachment_emailId_idx" ON "EmailAttachment"("emailId");

CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT,
    "purchaseOrderId" TEXT,
    "amountFils" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "occurredAt" DATETIME,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "note" TEXT,
    "requestKey" TEXT,
    CHECK (("orderId" IS NOT NULL) != ("purchaseOrderId" IS NOT NULL)),
    FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InvoicePayment_requestKey_key" ON "InvoicePayment"("requestKey");
CREATE INDEX "InvoicePayment_orderId_occurredAt_idx" ON "InvoicePayment"("orderId", "occurredAt");
CREATE INDEX "InvoicePayment_purchaseOrderId_occurredAt_idx" ON "InvoicePayment"("purchaseOrderId", "occurredAt");

-- Preserve existing balances without inventing individual historical payments.
INSERT INTO "InvoicePayment" ("id", "orderId", "amountFils", "kind", "occurredAt", "actorName", "actorRole", "note")
SELECT 'opening-order-' || "id", "id", "paidFils", 'OpeningBalance', "paidAt", 'System migration', 'System',
       'Imported paid-so-far balance; individual historical payment dates were not recorded.'
FROM "Order" WHERE "paidFils" != 0;
INSERT INTO "InvoicePayment" ("id", "purchaseOrderId", "amountFils", "kind", "occurredAt", "actorName", "actorRole", "note")
SELECT 'opening-po-' || "id", "id", "paidFils", 'OpeningBalance', "paidAt", 'System migration', 'System',
       'Imported paid-so-far balance; individual historical payment dates were not recorded.'
FROM "PurchaseOrder" WHERE "paidFils" != 0;
