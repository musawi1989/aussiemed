-- AlterTable
ALTER TABLE "PriceTier" ADD COLUMN "unitName" TEXT;
ALTER TABLE "PriceTier" ADD COLUMN "unitsPerLevel" INTEGER;

-- AlterTable
ALTER TABLE "ProductMaster" ADD COLUMN "variantGroup" TEXT;
ALTER TABLE "ProductMaster" ADD COLUMN "variantLabel" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductSku" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productMasterId" TEXT NOT NULL,
    "skuCode" TEXT NOT NULL,
    "baseUnitName" TEXT NOT NULL DEFAULT 'Each',
    "unitLabel" TEXT NOT NULL,
    "unitShortLabel" TEXT NOT NULL,
    "eachesPerPack" INTEGER NOT NULL DEFAULT 1,
    "priceFils" INTEGER NOT NULL,
    "manualOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "weightGrams" INTEGER,
    "barcode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductSku_productMasterId_fkey" FOREIGN KEY ("productMasterId") REFERENCES "ProductMaster" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProductSku" ("barcode", "createdAt", "eachesPerPack", "id", "isActive", "manualOutOfStock", "priceFils", "productMasterId", "skuCode", "unitLabel", "unitShortLabel", "updatedAt", "weightGrams") SELECT "barcode", "createdAt", "eachesPerPack", "id", "isActive", "manualOutOfStock", "priceFils", "productMasterId", "skuCode", "unitLabel", "unitShortLabel", "updatedAt", "weightGrams" FROM "ProductSku";
DROP TABLE "ProductSku";
ALTER TABLE "new_ProductSku" RENAME TO "ProductSku";
CREATE UNIQUE INDEX "ProductSku_skuCode_key" ON "ProductSku"("skuCode");
CREATE INDEX "ProductSku_productMasterId_idx" ON "ProductSku"("productMasterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProductMaster_variantGroup_idx" ON "ProductMaster"("variantGroup");
