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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductSupply_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "ProductSku" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductSupply_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProductSupply" ("costFils", "createdAt", "id", "isAvailable", "leadTimeDays", "rank", "skuId", "supplierId", "supplierPartNumber", "updatedAt") SELECT "costFils", "createdAt", "id", "isAvailable", "leadTimeDays", "rank", "skuId", "supplierId", "supplierPartNumber", "updatedAt" FROM "ProductSupply";
DROP TABLE "ProductSupply";
ALTER TABLE "new_ProductSupply" RENAME TO "ProductSupply";
CREATE INDEX "ProductSupply_supplierId_idx" ON "ProductSupply"("supplierId");
CREATE UNIQUE INDEX "ProductSupply_skuId_rank_key" ON "ProductSupply"("skuId", "rank");
CREATE UNIQUE INDEX "ProductSupply_skuId_supplierId_key" ON "ProductSupply"("skuId", "supplierId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill: every existing product/supplier pairing becomes a primary supply.
--
-- ProductMaster.supplierId is still the source of truth today, so this carries
-- the existing relationships across without a break in service. Supply is held
-- per SKU rather than per product, because two suppliers of the same product
-- quote per pack, so one row is created for each SKU of each product.
--
-- costFils is deliberately left null. Cost arrives with the real catalogue,
-- and zero would show a 100% margin on every line and be believed.
--
-- Written as a data migration rather than a script so it runs exactly once,
-- in order, and is recorded in git rather than in someone's shell history.
INSERT INTO "ProductSupply" (
    "id", "skuId", "supplierId", "rank", "costFils",
    "supplierPartNumber", "leadTimeDays", "isAvailable", "createdAt", "updatedAt"
)
SELECT
    lower(hex(randomblob(16))),
    sku."id",
    product."supplierId",
    'Primary',
    NULL,
    NULL,
    NULL,
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "ProductSku" AS sku
JOIN "ProductMaster" AS product ON product."id" = sku."productMasterId"
-- Idempotent: re-running must not violate the one-primary-per-SKU constraint.
WHERE NOT EXISTS (
    SELECT 1 FROM "ProductSupply" AS existing
    WHERE existing."skuId" = sku."id" AND existing."rank" = 'Primary'
);
