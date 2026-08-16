-- CreateTable
CREATE TABLE "OrganisationStaff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganisationStaff_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Address" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organisationId" TEXT NOT NULL,
    "label" TEXT,
    "contact" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "emirate" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'United Arab Emirates',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Address_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Address" ("city", "contact", "country", "createdAt", "emirate", "id", "isDefault", "label", "line1", "line2", "organisationId", "phone") SELECT "city", "contact", "country", "createdAt", "emirate", "id", "isDefault", "label", "line1", "line2", "organisationId", "phone" FROM "Address";
DROP TABLE "Address";
ALTER TABLE "new_Address" RENAME TO "Address";
CREATE INDEX "Address_organisationId_idx" ON "Address"("organisationId");
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "userId" TEXT,
    "organisationId" TEXT,
    "guestCartKey" TEXT,
    "addressId" TEXT,
    "staffId" TEXT,
    "placedByName" TEXT,
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
    "customerNotes" TEXT,
    "placedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "OrganisationStaff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("addressId", "courier", "customerNotes", "deliveryPriceFils", "deliveryType", "estimatedShipmentOn", "guestCartKey", "id", "internalNotes", "organisationId", "paidAt", "paidFils", "paymentDueOn", "paymentMethod", "paymentStatus", "placedAt", "poReference", "reference", "shippingSnapshot", "status", "subtotalFils", "totalFils", "trackingNumber", "updatedAt", "userId", "vatFils", "vatRateBasisPoints") SELECT "addressId", "courier", "customerNotes", "deliveryPriceFils", "deliveryType", "estimatedShipmentOn", "guestCartKey", "id", "internalNotes", "organisationId", "paidAt", "paidFils", "paymentDueOn", "paymentMethod", "paymentStatus", "placedAt", "poReference", "reference", "shippingSnapshot", "status", "subtotalFils", "totalFils", "trackingNumber", "updatedAt", "userId", "vatFils", "vatRateBasisPoints" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_organisationId_idx" ON "Order"("organisationId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "OrganisationStaff_organisationId_idx" ON "OrganisationStaff"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationStaff_organisationId_name_key" ON "OrganisationStaff"("organisationId", "name");
