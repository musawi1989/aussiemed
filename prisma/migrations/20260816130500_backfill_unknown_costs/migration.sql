-- Restores the difference between "free" and "not recorded" on purchase orders
-- already raised.
--
-- buildPurchaseOrders wrote `unitCostFils ?? 0`, so every line drawn from a
-- supply with no recorded cost was stored as costing nothing. Downstream that
-- is indistinguishable from a genuinely free item, and the realised margin on
-- the customer order it fulfilled came out at 100% — stated confidently, on
-- the screen whose entire purpose is deciding whether a trade is worth doing.
--
-- A zero unit cost has never been a real value here: AussieMed does not buy
-- anything for nothing. Every one of them is a flattened null, so they can be
-- restored without guessing.

UPDATE "PurchaseOrderLine"
SET "unitCostFilsSnapshot" = NULL,
    "lineCostFils" = NULL
WHERE "unitCostFilsSnapshot" = 0;

-- An order's total is unknown the moment one of its lines is. Leaving a total
-- that silently excludes the uncosted lines is the same error one level up.
UPDATE "PurchaseOrder"
SET "totalCostFils" = NULL
WHERE "id" IN (
  SELECT "purchaseOrderId" FROM "PurchaseOrderLine"
  WHERE "unitCostFilsSnapshot" IS NULL
);

-- And a total of zero on an order that has lines never meant zero either.
UPDATE "PurchaseOrder"
SET "totalCostFils" = NULL
WHERE "totalCostFils" = 0
  AND "id" IN (SELECT "purchaseOrderId" FROM "PurchaseOrderLine");
