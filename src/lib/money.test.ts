import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CURRENCY,
  VAT_RATE,
  formatAED,
  formatQty,
  lineTotal,
  nextTierFor,
  normaliseQty,
  round2,
  savingPercent,
  totalsFor,
  unitPriceFor,
} from "./money.ts";
import type { PriceTier } from "./types.ts";

/** Omron, after normalisation: base 186.99, one break at 3+. */
const OMRON: PriceTier[] = [{ minQty: 3, priceAED: 179.99 }];

/** Scrub top: the one product whose source tiers were well formed. */
const SCRUB: PriceTier[] = [
  { minQty: 5, priceAED: 95 },
  { minQty: 10, priceAED: 90 },
];

describe("currency formatting", () => {
  it("always uses the English string AED, never a localised symbol", () => {
    assert.equal(CURRENCY, "AED");
    assert.match(formatAED(35.97), /^AED /);
    // The bug from the old site: "د.إ 35.9700".
    assert.ok(!formatAED(35.97).includes("د.إ"));
  });

  it("always renders exactly two decimals", () => {
    assert.equal(formatAED(35.97), "AED 35.97");
    assert.equal(formatAED(36), "AED 36.00");
    assert.equal(formatAED(2.5), "AED 2.50");
    assert.equal(formatAED(0), "AED 0.00");
  });

  it("groups thousands", () => {
    assert.equal(formatAED(1170.5), "AED 1,170.50");
    assert.equal(formatAED(1444.98), "AED 1,444.98");
  });

  it("puts the minus sign before the currency, not inside the number", () => {
    assert.equal(formatAED(-47.2), "-AED 47.20");
  });

  it("degrades to zero rather than rendering NaN at a customer", () => {
    assert.equal(formatAED(Number.NaN), "AED 0.00");
    assert.equal(formatAED(Number.POSITIVE_INFINITY), "AED 0.00");
  });
});

describe("quantities", () => {
  it("renders as integers — never '3.00'", () => {
    assert.equal(formatQty(3), "3");
    assert.equal(formatQty(3.7), "3");
    assert.equal(formatQty(0), "0");
  });

  it("never goes below the minimum", () => {
    assert.equal(normaliseQty(0), 1);
    assert.equal(normaliseQty(-5), 1);
    assert.equal(normaliseQty(0, 0), 0);
    assert.equal(normaliseQty(-5, 0), 0);
  });

  it("truncates fractions and survives junk input", () => {
    assert.equal(normaliseQty(4.9), 4);
    assert.equal(normaliseQty(Number.NaN), 1);
  });
});

describe("rounding", () => {
  it("rounds half up despite binary floating point", () => {
    assert.equal(round2(1.005), 1.01);
    assert.equal(round2(2.675), 2.68);
    assert.equal(round2(0.145), 0.15);
  });

  it("leaves clean values alone", () => {
    assert.equal(round2(18.9), 18.9);
    assert.equal(round2(35.97), 35.97);
  });
});

describe("tier pricing", () => {
  it("uses the base price below the first break", () => {
    assert.equal(unitPriceFor(186.99, OMRON, 1), 186.99);
    assert.equal(unitPriceFor(186.99, OMRON, 2), 186.99);
  });

  it("applies the break exactly at its threshold", () => {
    assert.equal(unitPriceFor(186.99, OMRON, 3), 179.99);
  });

  it("takes the best qualifying break, not the first", () => {
    assert.equal(unitPriceFor(100, SCRUB, 4), 100);
    assert.equal(unitPriceFor(100, SCRUB, 5), 95);
    assert.equal(unitPriceFor(100, SCRUB, 9), 95);
    assert.equal(unitPriceFor(100, SCRUB, 10), 90);
    assert.equal(unitPriceFor(100, SCRUB, 500), 90);
  });

  it("falls back to the base price when there are no tiers", () => {
    assert.equal(unitPriceFor(12.49, [], 100), 12.49);
  });

  it("never lets a fractional quantity buy a cheaper tier", () => {
    // 2.9 must not round up into the 3+ break.
    assert.equal(unitPriceFor(186.99, OMRON, 2.9), 186.99);
  });

  it("reports the next unmet break for the upsell nudge", () => {
    assert.deepEqual(nextTierFor(SCRUB, 1), { minQty: 5, priceAED: 95 });
    assert.deepEqual(nextTierFor(SCRUB, 5), { minQty: 10, priceAED: 90 });
    assert.equal(nextTierFor(SCRUB, 10), null);
    assert.equal(nextTierFor([], 1), null);
  });

  it("computes the saving percentage against the base price", () => {
    assert.equal(savingPercent(100, 90), 10);
    assert.equal(savingPercent(186.99, 179.99), 4);
    assert.equal(savingPercent(0, 0), 0);
  });
});

describe("line totals", () => {
  it("multiplies the tier-adjusted unit price by quantity", () => {
    // The figures verified in the browser.
    assert.equal(lineTotal(186.99, OMRON, 4), 719.96);
    assert.equal(lineTotal(34.5, [{ minQty: 10, priceAED: 32.9 }], 12), 394.8);
  });

  it("does not accumulate floating point drift", () => {
    assert.equal(lineTotal(0.1, [], 3), 0.3);
    assert.equal(lineTotal(19.99, [], 12), 239.88);
  });
});

describe("cart totals", () => {
  const lines = [
    { basePriceAED: 186.99, tiers: OMRON, qty: 4 },
    { basePriceAED: 34.5, tiers: [{ minQty: 10, priceAED: 32.9 }], qty: 12 },
  ];

  it("matches the totals verified end to end in the browser", () => {
    const totals = totalsFor(lines);
    assert.equal(totals.subtotalAED, 1114.76);
    assert.equal(totals.vatAED, 55.74);
    assert.equal(totals.totalAED, 1170.5);
    assert.equal(totals.itemCount, 16);
  });

  it("applies VAT at 5% of the subtotal", () => {
    assert.equal(VAT_RATE, 0.05);
    const totals = totalsFor([{ basePriceAED: 100, tiers: [], qty: 1 }]);
    assert.equal(totals.vatAED, 5);
    assert.equal(totals.totalAED, 105);
  });

  it("keeps total equal to subtotal plus VAT to the cent", () => {
    const totals = totalsFor(lines);
    assert.equal(
      round2(totals.subtotalAED + totals.vatAED),
      totals.totalAED
    );
  });

  it("handles an empty cart without producing NaN", () => {
    const totals = totalsFor([]);
    assert.deepEqual(totals, {
      subtotalAED: 0,
      vatAED: 0,
      totalAED: 0,
      itemCount: 0,
    });
  });

  it("counts items as whole units", () => {
    const totals = totalsFor([{ basePriceAED: 10, tiers: [], qty: 2.8 }]);
    assert.equal(totals.itemCount, 2);
  });
});

describe("invoice splitting arithmetic", () => {
  // The order verified in the browser: AM-2026-000318 across four suppliers.
  // Per-invoice VAT must sum to the order VAT, or the split and the total
  // disagree by a cent and the customer notices.
  const invoiceSubtotals = [789.6, 239.88, 247.5, 168];

  it("sums per-invoice VAT to the order VAT without drift", () => {
    const perInvoiceVat = invoiceSubtotals.map((s) => round2(s * VAT_RATE));
    assert.deepEqual(perInvoiceVat, [39.48, 11.99, 12.38, 8.4]);

    const summedVat = round2(perInvoiceVat.reduce((a, b) => a + b, 0));
    const orderSubtotal = round2(
      invoiceSubtotals.reduce((a, b) => a + b, 0)
    );
    const orderVat = round2(orderSubtotal * VAT_RATE);

    assert.equal(orderSubtotal, 1444.98);
    assert.equal(orderVat, 72.25);
    assert.equal(summedVat, orderVat);
    assert.equal(round2(orderSubtotal + orderVat), 1517.23);
  });
});
