-- CreateTable
CREATE TABLE "ProductSupply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skuId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "rank" TEXT NOT NULL,
    "costFils" INTEGER NOT NULL,
    "supplierPartNumber" TEXT,
    "leadTimeDays" INTEGER,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductSupply_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "ProductSku" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductSupply_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "cutoffAt" DATETIME NOT NULL,
    "sentAt" DATETIME,
    "acknowledgedAt" DATETIME,
    "expectedAt" DATETIME,
    "receivedAt" DATETIME,
    "cancelledAt" DATETIME,
    "totalCostFils" INTEGER NOT NULL DEFAULT 0,
    "internalNotes" TEXT,
    "supplierNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseOrderId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "supplierPartNumberSnapshot" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "skuCodeSnapshot" TEXT NOT NULL,
    "unitCostFilsSnapshot" INTEGER NOT NULL,
    "qtyOrdered" INTEGER NOT NULL,
    "qtyReceived" INTEGER NOT NULL DEFAULT 0,
    "wasFallback" BOOLEAN NOT NULL DEFAULT false,
    "lineCostFils" INTEGER NOT NULL,
    CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrderLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "ProductSku" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseOrderLineId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "batchCode" TEXT,
    "expiresOn" DATETIME,
    "allocatedBy" TEXT,
    "allocatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseAllocation_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseAllocation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "companyName" TEXT NOT NULL,
    "primaryEmail" TEXT NOT NULL,
    "secondaryEmail" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "trn" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "promisedLeadTimeDays" INTEGER,
    "ackSlaHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Supplier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Supplier" ("address", "companyName", "createdAt", "id", "phone", "primaryEmail", "secondaryEmail", "status", "trn", "updatedAt", "userId") SELECT "address", "companyName", "createdAt", "id", "phone", "primaryEmail", "secondaryEmail", "status", "trn", "updatedAt", "userId" FROM "Supplier";
DROP TABLE "Supplier";
ALTER TABLE "new_Supplier" RENAME TO "Supplier";
CREATE UNIQUE INDEX "Supplier_userId_key" ON "Supplier"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProductSupply_supplierId_idx" ON "ProductSupply"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSupply_skuId_rank_key" ON "ProductSupply"("skuId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSupply_skuId_supplierId_key" ON "ProductSupply"("skuId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_cutoffAt_idx" ON "PurchaseOrder"("cutoffAt");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_purchaseOrderId_idx" ON "PurchaseOrderLine"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_skuId_idx" ON "PurchaseOrderLine"("skuId");

-- CreateIndex
CREATE INDEX "PurchaseAllocation_purchaseOrderLineId_idx" ON "PurchaseAllocation"("purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "PurchaseAllocation_orderItemId_idx" ON "PurchaseAllocation"("orderItemId");

-- CreateIndex
CREATE INDEX "PurchaseAllocation_batchCode_idx" ON "PurchaseAllocation"("batchCode");
