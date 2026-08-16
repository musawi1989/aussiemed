-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PurchaseOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "cutoffAt" DATETIME NOT NULL,
    "sentAt" DATETIME,
    "acknowledgedAt" DATETIME,
    "dispatchedAt" DATETIME,
    "expectedAt" DATETIME,
    "receivedAt" DATETIME,
    "cancelledAt" DATETIME,
    "courier" TEXT,
    "trackingNumber" TEXT,
    "totalCostFils" INTEGER,
    "internalNotes" TEXT,
    "supplierNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseOrder" ("acknowledgedAt", "cancelledAt", "courier", "createdAt", "cutoffAt", "dispatchedAt", "expectedAt", "id", "internalNotes", "poNumber", "receivedAt", "sentAt", "status", "supplierId", "supplierNotes", "totalCostFils", "trackingNumber", "updatedAt") SELECT "acknowledgedAt", "cancelledAt", "courier", "createdAt", "cutoffAt", "dispatchedAt", "expectedAt", "id", "internalNotes", "poNumber", "receivedAt", "sentAt", "status", "supplierId", "supplierNotes", "totalCostFils", "trackingNumber", "updatedAt" FROM "PurchaseOrder";
DROP TABLE "PurchaseOrder";
ALTER TABLE "new_PurchaseOrder" RENAME TO "PurchaseOrder";
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");
CREATE INDEX "PurchaseOrder_cutoffAt_idx" ON "PurchaseOrder"("cutoffAt");
CREATE TABLE "new_PurchaseOrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseOrderId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "supplierPartNumberSnapshot" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "skuCodeSnapshot" TEXT NOT NULL,
    "unitCostFilsSnapshot" INTEGER,
    "qtyOrdered" INTEGER NOT NULL,
    "qtyReceived" INTEGER NOT NULL DEFAULT 0,
    "wasFallback" BOOLEAN NOT NULL DEFAULT false,
    "lineCostFils" INTEGER,
    CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrderLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "ProductSku" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseOrderLine" ("id", "lineCostFils", "nameSnapshot", "purchaseOrderId", "qtyOrdered", "qtyReceived", "skuCodeSnapshot", "skuId", "supplierPartNumberSnapshot", "unitCostFilsSnapshot", "wasFallback") SELECT "id", "lineCostFils", "nameSnapshot", "purchaseOrderId", "qtyOrdered", "qtyReceived", "skuCodeSnapshot", "skuId", "supplierPartNumberSnapshot", "unitCostFilsSnapshot", "wasFallback" FROM "PurchaseOrderLine";
DROP TABLE "PurchaseOrderLine";
ALTER TABLE "new_PurchaseOrderLine" RENAME TO "PurchaseOrderLine";
CREATE INDEX "PurchaseOrderLine_purchaseOrderId_idx" ON "PurchaseOrderLine"("purchaseOrderId");
CREATE INDEX "PurchaseOrderLine_skuId_idx" ON "PurchaseOrderLine"("skuId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
