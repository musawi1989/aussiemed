-- AlterTable
ALTER TABLE "ProductSupply" ADD COLUMN "proposedAt" DATETIME;
ALTER TABLE "ProductSupply" ADD COLUMN "proposedByName" TEXT;
ALTER TABLE "ProductSupply" ADD COLUMN "proposedCostFils" INTEGER;
ALTER TABLE "ProductSupply" ADD COLUMN "proposedReason" TEXT;
