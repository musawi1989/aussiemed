-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN "courier" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "dispatchedAt" DATETIME;
ALTER TABLE "PurchaseOrder" ADD COLUMN "trackingNumber" TEXT;
