import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { comparePriceFils,
  DEFAULT_VAT_BASIS_POINTS,
  accountUnitPriceFils,
  applyDiscountFils,
  formatInvoiceNumber,
  formatReference,
  priceLine,
  sumLines,
  unitPriceFilsFor,
  vatBasisPointsFor,
  type TierFils,
} from "./pricing.ts";

/** Nitrile gloves: 34.50 a box, 32.90 from ten, 30.50 from fifty. */
const GLOVES: TierFils[] = [
  { minQty: 10, priceFils: 3290 },
  { minQty: 50, priceFils: 3050 },
];

describe("tier resolution in fils", () => {
  it("uses the base price below the first break", () => {
    assert.equal(unitPriceFilsFor(3450, GLOVES, 1), 3450);
    assert.equal(unitPriceFilsFor(3450, GLOVES, 9), 3450);
  });

  it("applies a break exactly at its threshold", () => {
    assert.equal(unitPriceFilsFor(3450, GLOVES, 10), 3290);
    assert.equal(unitPriceFilsFor(3450, GLOVES, 50), 3050);
  });

  it("takes the best qualifying break regardless of tier order", () => {
    const shuffled = [...GLOVES].reverse();
    assert.equal(unitPriceFilsFor(3450, shuffled, 60), 3050);
  });

  it("never lets a fractional quantity buy a cheaper tier", () => {
    assert.equal(unitPriceFilsFor(3450, GLOVES, 9.9), 3450);
  });

  it("falls back to the base price with no tiers", () => {
    assert.equal(unitPriceFilsFor(1249, [], 500), 1249);
  });
});

describe("VAT by tax class", () => {
  it("charges the standard rate on a standard line", () => {
    assert.equal(vatBasisPointsFor("Standard"), 500);
    assert.equal(DEFAULT_VAT_BASIS_POINTS, 500);
  });

  it("charges nothing on a zero-rated line, in either spelling", () => {
    assert.equal(vatBasisPointsFor("ZeroRated"), 0);
    assert.equal(vatBasisPointsFor("zero-rated"), 0);
  });

  it("honours a configured rate", () => {
    assert.equal(vatBasisPointsFor("Standard", 0), 0);
    assert.equal(vatBasisPointsFor("Standard", 750), 750);
  });
});

describe("line pricing", () => {
  it("prices a standard line exactly", () => {
    const line = priceLine(3450, GLOVES, 12, "Standard");
    assert.equal(line.unitPriceFils, 3290);
    assert.equal(line.lineTotalFils, 39480); // AED 394.80
    assert.equal(line.vatFils, 1974); // AED 19.74
  });

  it("charges no VAT on a zero-rated line", () => {
    const line = priceLine(3450, GLOVES, 12, "ZeroRated");
    assert.equal(line.lineTotalFils, 39480);
    assert.equal(line.vatFils, 0);
  });

  it("keeps everything an integer — no fractional fils can exist", () => {
    const line = priceLine(1177, [], 7, "Standard");
    assert.ok(Number.isInteger(line.unitPriceFils));
    assert.ok(Number.isInteger(line.lineTotalFils));
    assert.ok(Number.isInteger(line.vatFils));
  });

  it("rounds VAT half-up on the awkward cases", () => {
    // 10 fils at 5% is 0.5 fils, which must round up rather than vanish.
    assert.equal(priceLine(10, [], 1, "Standard").vatFils, 1);
    // 9 fils at 5% is 0.45, which must round down.
    assert.equal(priceLine(9, [], 1, "Standard").vatFils, 0);
  });

  it("treats a zero or negative quantity as one", () => {
    assert.equal(priceLine(1000, [], 0, "Standard").qty, 1);
    assert.equal(priceLine(1000, [], -5, "Standard").qty, 1);
  });
});

describe("invoice totals", () => {
  it("sums lines exactly, with no floating point drift", () => {
    const lines = [
      priceLine(3450, GLOVES, 12, "Standard"),
      priceLine(1177, [], 3, "Standard"),
      priceLine(9900, [], 2, "ZeroRated"),
    ];
    const totals = sumLines(lines);

    assert.equal(totals.subtotalFils, 39480 + 3531 + 19800);
    assert.equal(totals.vatFils, 1974 + 177 + 0);
    assert.equal(totals.totalFils, totals.subtotalFils + totals.vatFils);
  });

  it("charges VAT only on the standard-rated part of a mixed order", () => {
    const totals = sumLines([
      priceLine(10000, [], 1, "ZeroRated"),
      priceLine(20000, [], 1, "Standard"),
    ]);
    assert.equal(totals.subtotalFils, 30000);
    assert.equal(totals.vatFils, 1000); // 5% of 20000 only
    assert.equal(totals.totalFils, 31000);
  });

  it("makes per-invoice totals sum to the order total", () => {
    // The property that matters: splitting an order across suppliers must not
    // change what the customer pays.
    const supplierA = [priceLine(3450, GLOVES, 24, "Standard")];
    const supplierB = [priceLine(1999, [], 12, "Standard")];
    const supplierC = [priceLine(825, [], 30, "ZeroRated")];

    const a = sumLines(supplierA);
    const b = sumLines(supplierB);
    const c = sumLines(supplierC);
    const whole = sumLines([...supplierA, ...supplierB, ...supplierC]);

    assert.equal(a.subtotalFils + b.subtotalFils + c.subtotalFils, whole.subtotalFils);
    assert.equal(a.vatFils + b.vatFils + c.vatFils, whole.vatFils);
    assert.equal(a.totalFils + b.totalFils + c.totalFils, whole.totalFils);
  });

  it("handles an empty order without producing NaN", () => {
    assert.deepEqual(sumLines([]), {
      subtotalFils: 0,
      vatFils: 0,
      totalFils: 0,
    });
  });
});

describe("reference numbers", () => {
  it("formats the order reference with a padded sequence", () => {
    assert.equal(formatReference(2026, 1), "AM-2026-000001");
    assert.equal(formatReference(2026, 318), "AM-2026-000318");
  });

  it("does not truncate once the sequence outgrows its padding", () => {
    assert.equal(formatReference(2026, 1234567), "AM-2026-1234567");
  });

  it("derives an invoice number from its order reference", () => {
    assert.equal(formatInvoiceNumber("AM-2026-000318", 1), "AM-2026-000318-01");
    assert.equal(formatInvoiceNumber("AM-2026-000318", 12), "AM-2026-000318-12");
  });
});

describe("applyDiscountFils", () => {
  it("takes a percentage off, exactly", () => {
    // 2.5% of 1000 fils is 25.
    assert.equal(applyDiscountFils(1000, 250), 975);
    assert.equal(applyDiscountFils(2000, 1000), 1800); // 10%
  });

  it("rounds half up on the fils, never through a float", () => {
    // 2.5% of 1799 is 44.975 -> 45 off.
    assert.equal(applyDiscountFils(1799, 250), 1754);
    // 0.5% of 100 is 0.5 -> 1 off, half up.
    assert.equal(applyDiscountFils(100, 50), 99);
  });

  it("does nothing for no discount", () => {
    assert.equal(applyDiscountFils(1799, 0), 1799);
    assert.equal(applyDiscountFils(1799, -500), 1799, "a negative must not raise the price");
    assert.equal(applyDiscountFils(1799, Number.NaN), 1799);
  });

  it("never goes below zero, however absurd the figure", () => {
    assert.equal(applyDiscountFils(1000, 10000), 0);
    assert.equal(applyDiscountFils(1000, 999999), 0);
  });
});

describe("accountUnitPriceFils", () => {
  const tiers = [
    { minQty: 10, priceFils: 900 },
    { minQty: 50, priceFils: 800 },
  ];

  it("is the list price when the account has no terms", () => {
    assert.equal(accountUnitPriceFils(1000, tiers, 1), 1000);
    assert.equal(accountUnitPriceFils(1000, tiers, 10), 900);
    assert.equal(accountUnitPriceFils(1000, tiers, 50), 800);
  });

  it("applies the discount after the volume break, not before", () => {
    // 10 units qualify for 900; 10% off that is 810.
    assert.equal(
      accountUnitPriceFils(1000, tiers, 10, { discountBasisPoints: 1000 }),
      810
    );
  });

  it("lets an agreed price beat list, breaks and the discount alike", () => {
    const terms = { agreedPriceFils: 750, discountBasisPoints: 1000 };
    // Whatever the quantity, and with a discount that would otherwise apply.
    assert.equal(accountUnitPriceFils(1000, tiers, 1, terms), 750);
    assert.equal(accountUnitPriceFils(1000, tiers, 50, terms), 750);
  });

  it("does NOT stack the discount on an agreed price", () => {
    // The rule somebody will one day be tempted to change. 750 with 10% off
    // would be 675, and a buyer and a supplier reading the same row would
    // then get different answers about what was agreed.
    assert.equal(
      accountUnitPriceFils(1000, tiers, 1, {
        agreedPriceFils: 750,
        discountBasisPoints: 1000,
      }),
      750
    );
  });

  it("treats a zero agreed price as an agreement, not as absent", () => {
    // A free item on a tender is a real arrangement.
    assert.equal(accountUnitPriceFils(1000, tiers, 5, { agreedPriceFils: 0 }), 0);
  });

  it("treats null and undefined as no agreement", () => {
    assert.equal(accountUnitPriceFils(1000, tiers, 1, { agreedPriceFils: null }), 1000);
    assert.equal(accountUnitPriceFils(1000, tiers, 1, { agreedPriceFils: undefined }), 1000);
  });
});

describe("priceLine with account terms", () => {
  it("prices at list when no terms are passed, as every old caller does", () => {
    const line = priceLine(1000, [], 3, "Standard");
    assert.equal(line.unitPriceFils, 1000);
    assert.equal(line.lineTotalFils, 3000);
  });

  it("charges VAT on the discounted figure, not the list one", () => {
    // The customer is invoiced for what they pay. VAT on a price nobody was
    // charged would be VAT we collected on our own discount.
    const line = priceLine(1000, [], 2, "Standard", 500, { discountBasisPoints: 1000 });
    assert.equal(line.unitPriceFils, 900);
    assert.equal(line.lineTotalFils, 1800);
    assert.equal(line.vatFils, 90); // 5% of 1800, not of 2000
  });

  it("still zero-rates a zero-rated line after a discount", () => {
    const line = priceLine(1000, [], 2, "ZeroRated", 500, { discountBasisPoints: 1000 });
    assert.equal(line.vatFils, 0);
  });
});

describe("comparePriceFils", () => {
  const tiers = [{ minQty: 12, priceFils: 1800 }];

  it("shows nothing to strike through without an agreement", () => {
    const c = comparePriceFils(2000, [], 1, {});
    assert.equal(c.yoursFils, 2000);
    assert.equal(c.listFils, 2000);
    assert.equal(c.betterThanList, false);
  });

  it("measures an agreed price against the single-unit price below the break", () => {
    const c = comparePriceFils(2000, tiers, 1, { agreedPriceFils: 1700 });
    assert.equal(c.listFils, 2000);
    assert.equal(c.yoursFils, 1700);
    assert.equal(c.savingFils, 300);
    assert.equal(c.savingBasisPoints, 1500);
  });

  it("measures it against the VOLUME BREAK once the quantity qualifies", () => {
    // The honest comparison. Striking through 2000 at a quantity of twelve
    // would claim a saving of 300 when 200 of it is a break anybody gets.
    const c = comparePriceFils(2000, tiers, 12, { agreedPriceFils: 1700 });
    assert.equal(c.listFils, 1800);
    assert.equal(c.savingFils, 100);
  });

  it("reports no saving when the break has overtaken the agreed price", () => {
    // An agreed price wins outright, so an old arrangement can be worse than
    // a break added since. Saying so is the point.
    const c = comparePriceFils(2000, [{ minQty: 12, priceFils: 1500 }], 12, {
      agreedPriceFils: 1700,
    });
    assert.equal(c.yoursFils, 1700);
    assert.equal(c.listFils, 1500);
    assert.equal(c.savingFils, 0);
    assert.equal(c.betterThanList, false);
  });

  it("treats an agreed price of zero as real", () => {
    const c = comparePriceFils(2000, [], 1, { agreedPriceFils: 0 });
    assert.equal(c.yoursFils, 0);
    assert.equal(c.savingBasisPoints, 10_000);
  });

  it("shows an account discount as a saving too", () => {
    const c = comparePriceFils(2000, [], 1, { discountBasisPoints: 250 });
    assert.equal(c.yoursFils, 1950);
    assert.equal(c.savingFils, 50);
    assert.equal(c.betterThanList, true);
  });

  it("does not divide by zero on a free line", () => {
    const c = comparePriceFils(0, [], 1, {});
    assert.equal(c.savingBasisPoints, 0);
  });
});
