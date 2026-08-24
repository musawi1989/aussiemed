-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN "trnDocumentKey" TEXT;
ALTER TABLE "Organisation" ADD COLUMN "trnDocumentName" TEXT;
ALTER TABLE "Organisation" ADD COLUMN "trnDocumentUploadedAt" DATETIME;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN "trnDocumentKey" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "trnDocumentName" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "trnDocumentUploadedAt" DATETIME;
