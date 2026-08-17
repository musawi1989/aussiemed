-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductSupply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skuId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "rank" TEXT NOT NULL,
    "costFils" INTEGER,
    "supplierPartNumber" TEXT,
    "leadTimeDays" INTEGER,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "supplyStatus" TEXT NOT NULL DEFAULT 'Available',
    "alternativeSkuId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductSupply_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "ProductSku" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductSupply_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductSupply_alternativeSkuId_fkey" FOREIGN KEY ("alternativeSkuId") REFERENCES "ProductSku" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProductSupply" ("costFils", "createdAt", "id", "isAvailable", "leadTimeDays", "rank", "skuId", "supplierId", "supplierPartNumber", "updatedAt") SELECT "costFils", "createdAt", "id", "isAvailable", "leadTimeDays", "rank", "skuId", "supplierId", "supplierPartNumber", "updatedAt" FROM "ProductSupply";
DROP TABLE "ProductSupply";
ALTER TABLE "new_ProductSupply" RENAME TO "ProductSupply";
CREATE INDEX "ProductSupply_supplierId_idx" ON "ProductSupply"("supplierId");
CREATE UNIQUE INDEX "ProductSupply_skuId_rank_key" ON "ProductSupply"("skuId", "rank");
CREATE UNIQUE INDEX "ProductSupply_skuId_supplierId_key" ON "ProductSupply"("skuId", "supplierId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
