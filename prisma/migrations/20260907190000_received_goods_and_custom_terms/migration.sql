ALTER TABLE "Supplier" ADD COLUMN "paymentTermsLabel" TEXT;
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "qtyReviewed" INTEGER;
UPDATE "PurchaseOrderLine" SET "qtyReviewed" = "qtyOrdered" WHERE "qtyConfirmed" IS NOT NULL;
CREATE TABLE "GoodsReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "purchaseOrderLineId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "qty" INTEGER NOT NULL CHECK ("qty" > 0),
  "batchCode" TEXT,
  "expiresOn" DATETIME,
  "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedBy" TEXT,
  CONSTRAINT "GoodsReceipt_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GoodsReceipt_requestKey_key" ON "GoodsReceipt"("requestKey");
CREATE INDEX "GoodsReceipt_purchaseOrderLineId_idx" ON "GoodsReceipt"("purchaseOrderLineId");
CREATE INDEX "GoodsReceipt_receivedAt_idx" ON "GoodsReceipt"("receivedAt");
CREATE TABLE "GoodsAllocation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "receiptId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "qty" INTEGER NOT NULL CHECK ("qty" > 0),
  "allocatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "allocatedBy" TEXT,
  "requestKey" TEXT NOT NULL,
  CONSTRAINT "GoodsAllocation_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "GoodsReceipt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GoodsAllocation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GoodsAllocation_requestKey_key" ON "GoodsAllocation"("requestKey");
CREATE INDEX "GoodsAllocation_receiptId_idx" ON "GoodsAllocation"("receiptId");
CREATE INDEX "GoodsAllocation_orderItemId_idx" ON "GoodsAllocation"("orderItemId");

-- Older receipts were allocated automatically. Preserve those assignments once,
-- capped by actual receipts rather than treating the entire PO reservation as stock.
INSERT INTO "GoodsReceipt" ("id", "purchaseOrderLineId", "requestKey", "qty", "receivedAt")
SELECT 'legacy-receipt-' || l.id, l.id, 'legacy-receipt-' || l.id, l.qtyReceived,
       COALESCE(p.receivedAt, p.updatedAt)
FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" p ON p.id = l.purchaseOrderId WHERE l.qtyReceived > 0;
INSERT INTO "GoodsAllocation" ("id", "receiptId", "orderItemId", "qty", "allocatedAt", "allocatedBy", "requestKey")
SELECT 'legacy-allocation-' || id, 'legacy-receipt-' || purchaseOrderLineId, orderItemId,
       MIN(qty, MAX(0, qtyReceived - priorQty)), allocatedAt, allocatedBy, 'legacy-allocation-' || id
FROM (
  SELECT a.*, l.qtyReceived,
         COALESCE(SUM(a.qty) OVER (PARTITION BY a.purchaseOrderLineId ORDER BY o.placedAt, a.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS priorQty
  FROM "PurchaseAllocation" a JOIN "PurchaseOrderLine" l ON l.id = a.purchaseOrderLineId
  JOIN "OrderItem" i ON i.id = a.orderItemId JOIN "Order" o ON o.id = i.orderId
  WHERE l.qtyReceived > 0
) WHERE qtyReceived > priorQty AND qty > 0;
