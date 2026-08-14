import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_VAT_BASIS_POINTS,
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
