-- Proof that the goods arrived: the signed sheet, photographed or scanned.
-- storageKey is a private key, not a URL — the bytes live outside public/.
CREATE TABLE "DeliveryReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "receivedByName" TEXT,
    "receivedOn" DATETIME,
    "note" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByName" TEXT NOT NULL,
    CONSTRAINT "DeliveryReceipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DeliveryReceipt_orderId_idx" ON "DeliveryReceipt"("orderId");
