-- CreateTable
CREATE TABLE "CustomerPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "priceFils" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerPrice_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerPrice_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "ProductSku" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Organisation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "trn" TEXT,
    "trnDocumentKey" TEXT,
    "trnDocumentName" TEXT,
    "trnDocumentUploadedAt" DATETIME,
    "phone" TEXT,
    "emirate" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'AE',
    "isSelfRegistered" BOOLEAN NOT NULL DEFAULT false,
    "paymentTerms" TEXT NOT NULL DEFAULT 'Prepaid',
    "creditLimitFils" INTEGER NOT NULL DEFAULT 0,
    "discountBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Organisation" ("countryCode", "createdAt", "creditLimitFils", "emirate", "id", "isDisabled", "isSelfRegistered", "name", "notes", "paymentTerms", "phone", "trn", "trnDocumentKey", "trnDocumentName", "trnDocumentUploadedAt", "updatedAt") SELECT "countryCode", "createdAt", "creditLimitFils", "emirate", "id", "isDisabled", "isSelfRegistered", "name", "notes", "paymentTerms", "phone", "trn", "trnDocumentKey", "trnDocumentName", "trnDocumentUploadedAt", "updatedAt" FROM "Organisation";
DROP TABLE "Organisation";
ALTER TABLE "new_Organisation" RENAME TO "Organisation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CustomerPrice_organisationId_idx" ON "CustomerPrice"("organisationId");

-- CreateIndex
CREATE INDEX "CustomerPrice_skuId_idx" ON "CustomerPrice"("skuId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPrice_organisationId_skuId_key" ON "CustomerPrice"("organisationId", "skuId");
