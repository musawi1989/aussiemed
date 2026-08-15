-- AlterTable
ALTER TABLE "Order" ADD COLUMN "internalNotes" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "skuCodeSnapshot" TEXT NOT NULL,
    "unitLabelSnapshot" TEXT NOT NULL,
    "taxClassSnapshot" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPriceFils" INTEGER NOT NULL,
    "lineTotalFils" INTEGER NOT NULL,
    "vatFils" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "batchCodeSnapshot" TEXT,
    "expiresOnSnapshot" DATETIME,
    "internalNotes" TEXT,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "OrderSupplierInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "ProductSku" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("id", "invoiceId", "lineTotalFils", "nameSnapshot", "orderId", "qty", "skuCodeSnapshot", "skuId", "taxClassSnapshot", "unitLabelSnapshot", "unitPriceFils", "vatFils") SELECT "id", "invoiceId", "lineTotalFils", "nameSnapshot", "orderId", "qty", "skuCodeSnapshot", "skuId", "taxClassSnapshot", "unitLabelSnapshot", "unitPriceFils", "vatFils" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_invoiceId_idx" ON "OrderItem"("invoiceId");
CREATE INDEX "OrderItem_batchCodeSnapshot_idx" ON "OrderItem"("batchCodeSnapshot");
CREATE INDEX "OrderItem_skuId_idx" ON "OrderItem"("skuId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

