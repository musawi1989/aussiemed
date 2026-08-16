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
  pluraliseUnit,
  round2,
  savingPercent,
  totalsFor,
  unitPriceFor,
  vatRateFor,
  displayPrice,
  packFor,
  pricePerEach,
  type PriceableLine,
} from "./money.ts";
import type { Pack, PriceTier, Product } from "./types.ts";

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
  const lines: PriceableLine[] = [
    { basePriceAED: 186.99, tiers: OMRON, qty: 4, taxClass: "standard" },
    { basePriceAED: 34.5, tiers: [{ minQty: 10, priceAED: 32.9 }], qty: 12, taxClass: "standard" },
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
    const totals = totalsFor([{ basePriceAED: 100, tiers: [], qty: 1, taxClass: "standard" }]);
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
      zeroRatedAED: 0,
    });
  });

  it("counts items as whole units", () => {
    const totals = totalsFor([{ basePriceAED: 10, tiers: [], qty: 2.8, taxClass: "standard" }]);
    assert.equal(totals.itemCount, 2);
  });
});

describe("VAT treatment", () => {
  it("charges nothing on a zero-rated line", () => {
    assert.equal(vatRateFor("zero-rated"), 0);
    assert.equal(vatRateFor("standard"), 0.05);

    const totals = totalsFor([
      { basePriceAED: 100, tiers: [], qty: 1, taxClass: "zero-rated" },
    ]);
    assert.equal(totals.subtotalAED, 100);
    assert.equal(totals.vatAED, 0);
    assert.equal(totals.totalAED, 100);
    assert.equal(totals.zeroRatedAED, 100);
  });

  it("charges VAT only on the standard-rated part of a mixed cart", () => {
    const totals = totalsFor([
      { basePriceAED: 100, tiers: [], qty: 1, taxClass: "zero-rated" },
      { basePriceAED: 200, tiers: [], qty: 1, taxClass: "standard" },
    ]);
    assert.equal(totals.subtotalAED, 300);
    assert.equal(totals.vatAED, 10); // 5% of 200 only, not of 300
    assert.equal(totals.totalAED, 310);
    assert.equal(totals.zeroRatedAED, 100);
  });

  it("shows a zero-rated price unchanged when the buyer switches to inc. VAT", () => {
    assert.equal(displayPrice(100, "zero-rated", true), 100);
    assert.equal(displayPrice(100, "zero-rated", false), 100);
    assert.equal(displayPrice(100, "standard", true), 105);
    assert.equal(displayPrice(100, "standard", false), 100);
  });

  it("rounds the inc-VAT price to the cent", () => {
    assert.equal(displayPrice(34.5, "standard", true), 36.23); // 36.225
    assert.equal(displayPrice(11.77, "standard", true), 12.36);
  });
});

describe("packs", () => {
  const box: Pack = {
    id: "base", sku: "PL-1", label: "100 Pieces/Box", shortLabel: "Box",
    eachesPerPack: 1, priceAED: 34.5,
    tiers: [{ minQty: 10, priceAED: 32.9 }], outOfStock: false,
  };
  const carton: Pack = {
    id: "outer", sku: "PL-1-10", label: "10 Boxes/Carton", shortLabel: "Carton",
    eachesPerPack: 10, priceAED: 295.85, tiers: [], outOfStock: false,
  };
  const product = {
    packs: [box, carton], defaultPackId: "base",
  } as unknown as Product;

  it("resolves the requested pack", () => {
    assert.equal(packFor(product, "outer").id, "outer");
    assert.equal(packFor(product, "base").id, "base");
  });

  it("falls back to the default for an unknown pack id", () => {
    // A stale cart entry must not crash or silently price the wrong unit.
    assert.equal(packFor(product, "nope").id, "base");
    assert.equal(packFor(product, undefined).id, "base");
  });

  it("computes a comparable per-unit price across pack sizes", () => {
    assert.equal(pricePerEach(box, 1), 34.5);
    // The carton must genuinely beat buying its contents separately, or there
    // is no reason for a trade buyer to order one.
    assert.equal(pricePerEach(carton, 1), 29.59);
    assert.ok(pricePerEach(carton, 1) < pricePerEach(box, 10));
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

describe("pluraliseUnit", () => {
  it("drops 'Each', which is a unit name and not a word a buyer says", () => {
    // "2 eaches in your cart" is how this reads if the word is kept.
    assert.equal(pluraliseUnit("Each", 2), "");
    assert.equal(pluraliseUnit("each", 1), "");
  });

  it("leaves a single unit singular", () => {
    assert.equal(pluraliseUnit("Box", 1), "box");
    assert.equal(pluraliseUnit("Bottle", 1), "bottle");
  });

  it("adds 'es' after a sibilant rather than a bare 's'", () => {
    assert.equal(pluraliseUnit("Box", 2), "boxes");
    assert.equal(pluraliseUnit("Patch", 3), "patches");
    assert.equal(pluraliseUnit("Brush", 4), "brushes");
  });

  it("turns a consonant + y into 'ies', and leaves a vowel + y alone", () => {
    assert.equal(pluraliseUnit("Ply", 2), "plies");
    assert.equal(pluraliseUnit("Tray", 2), "trays");
  });

  it("handles the ordinary units the catalogue actually uses", () => {
    assert.equal(pluraliseUnit("Pack", 12), "packs");
    assert.equal(pluraliseUnit("Carton", 2), "cartons");
    assert.equal(pluraliseUnit("Roll", 144), "rolls");
    assert.equal(pluraliseUnit("Tube", 2), "tubes");
  });

  it("survives a missing or blank unit rather than printing 'nulls'", () => {
    assert.equal(pluraliseUnit(null, 2), "");
    assert.equal(pluraliseUnit("   ", 2), "");
  });
});
