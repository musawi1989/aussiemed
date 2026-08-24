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
    "paymentStatus" TEXT NOT NULL DEFAULT 'Unpaid',
    "paidFils" INTEGER NOT NULL DEFAULT 0,
    "paidAt" DATETIME,
    "paymentDueOn" DATETIME,
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
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
