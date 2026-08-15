-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "userId" TEXT,
    "organisationId" TEXT,
    "guestCartKey" TEXT,
    "addressId" TEXT,
    "shippingSnapshot" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "paymentMethod" TEXT NOT NULL DEFAULT 'OfflinePurchaseOrder',
    "poReference" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'Unpaid',
    "paidAt" DATETIME,
    "paidFils" INTEGER NOT NULL DEFAULT 0,
    "paymentDueOn" DATETIME,
    "deliveryType" TEXT NOT NULL DEFAULT 'Delivery',
    "deliveryPriceFils" INTEGER NOT NULL DEFAULT 0,
    "estimatedShipmentOn" DATETIME,
    "trackingNumber" TEXT,
    "courier" TEXT,
    "subtotalFils" INTEGER NOT NULL,
    "vatFils" INTEGER NOT NULL,
    "totalFils" INTEGER NOT NULL,
    "vatRateBasisPoints" INTEGER NOT NULL DEFAULT 500,
    "internalNotes" TEXT,
    "placedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("addressId", "guestCartKey", "id", "internalNotes", "organisationId", "paymentMethod", "placedAt", "poReference", "reference", "shippingSnapshot", "status", "subtotalFils", "totalFils", "updatedAt", "userId", "vatFils", "vatRateBasisPoints") SELECT "addressId", "guestCartKey", "id", "internalNotes", "organisationId", "paymentMethod", "placedAt", "poReference", "reference", "shippingSnapshot", "status", "subtotalFils", "totalFils", "updatedAt", "userId", "vatFils", "vatRateBasisPoints" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_organisationId_idx" ON "Order"("organisationId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

