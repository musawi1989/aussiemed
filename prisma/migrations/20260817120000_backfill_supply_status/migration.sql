-- Bring supplyStatus in line with the availability already recorded.
--
-- The migration that added supplyStatus defaulted every row to 'Available',
-- including rows already flagged unavailable — so a supplier who had said they
-- could not supply an item had that silently reversed on the new field while
-- the old one still said otherwise. db:check now asserts the two agree, and
-- caught it on its first run.
--
-- 'OutOfStock' rather than 'Discontinued' on purpose: the old checkbox could
-- not tell them apart, and out of stock is the recoverable reading. Marking a
-- line permanently dead on a guess would take a product off sale for good.
UPDATE "ProductSupply"
SET "supplyStatus" = 'OutOfStock'
WHERE "isAvailable" = 0 AND "supplyStatus" = 'Available';
