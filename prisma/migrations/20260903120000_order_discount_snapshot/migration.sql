-- What a line would have cost without the account's terms, and why it was
-- cheaper. Both nullable: an order placed before this existed has no list
-- price on file, and inventing one from today's prices would restate an
-- invoice that has already been sent.
ALTER TABLE "OrderItem" ADD COLUMN "listUnitPriceFils" INTEGER;
ALTER TABLE "OrderItem" ADD COLUMN "discountSource" TEXT;

-- The account discount in force at the time, in basis points. Defaults to 0,
-- which is correct for every historical row: an order with no snapshot shows
-- no discount rather than one worked out from what the account is on today.
ALTER TABLE "Order" ADD COLUMN "accountDiscountBasisPoints" INTEGER NOT NULL DEFAULT 0;
