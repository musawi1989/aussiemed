-- DropIndex
DROP INDEX "OrderSupplierInvoice_orderId_supplierId_key";

-- DropIndex
DROP INDEX "OrderSupplierInvoice_supplierId_idx";

-- DropIndex
DROP INDEX "OrderSupplierInvoice_invoiceNumber_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "OrderSupplierInvoice";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
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
    CONSTRAINT "OrderItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "ProductSku" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("batchCodeSnapshot", "expiresOnSnapshot", "id", "internalNotes", "lineTotalFils", "nameSnapshot", "orderId", "qty", "skuCodeSnapshot", "skuId", "status", "taxClassSnapshot", "unitLabelSnapshot", "unitPriceFils", "vatFils") SELECT "batchCodeSnapshot", "expiresOnSnapshot", "id", "internalNotes", "lineTotalFils", "nameSnapshot", "orderId", "qty", "skuCodeSnapshot", "skuId", "status", "taxClassSnapshot", "unitLabelSnapshot", "unitPriceFils", "vatFils" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_batchCodeSnapshot_idx" ON "OrderItem"("batchCodeSnapshot");
CREATE INDEX "OrderItem_skuId_idx" ON "OrderItem"("skuId");
CREATE TABLE "new_ProductMaster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "brandId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "variantGroup" TEXT,
    "variantLabel" TEXT,
    "taxClass" TEXT NOT NULL DEFAULT 'Standard',
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductMaster_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProductMaster" ("approvedAt", "approvedBy", "brandId", "createdAt", "createdBy", "description", "id", "metaDescription", "metaTitle", "name", "slug", "status", "taxClass", "updatedAt", "variantGroup", "variantLabel") SELECT "approvedAt", "approvedBy", "brandId", "createdAt", "createdBy", "description", "id", "metaDescription", "metaTitle", "name", "slug", "status", "taxClass", "updatedAt", "variantGroup", "variantLabel" FROM "ProductMaster";
DROP TABLE "ProductMaster";
ALTER TABLE "new_ProductMaster" RENAME TO "ProductMaster";
CREATE UNIQUE INDEX "ProductMaster_slug_key" ON "ProductMaster"("slug");
CREATE INDEX "ProductMaster_status_idx" ON "ProductMaster"("status");
CREATE INDEX "ProductMaster_brandId_idx" ON "ProductMaster"("brandId");
CREATE INDEX "ProductMaster_variantGroup_idx" ON "ProductMaster"("variantGroup");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
