-- When a supplier lost the primary slot by saying they were out of stock.
-- Null for cover we set by hand, which is all of it before this existed.
ALTER TABLE "ProductSupply" ADD COLUMN "demotedAt" DATETIME;
