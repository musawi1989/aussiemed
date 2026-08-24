import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { byProfit, losingMoney, profitTotals } from "./profit-report.ts";
import type { ProductPerformance } from "./own-brand.ts";

/** A row with everything defaulted, so each test states only what it is about. */
const row = (over: Partial<ProductPerformance> = {}): ProductPerformance => ({
  slug: "thing",
  name: "Thing",
  brand: null,
  category: null,
  units: 10,
  orders: 1,
  customers: 1,
  revenueFils: 10000,
  costedRevenueFils: 10000,
  costFils: 6000,
  profitFils: 4000,
  marginPercent: 40,
  uncostedUnits: 0,
  supplierCount: 1,
  ...over,
});

describe("profitTotals", () => {
  it("is what we sold for less what we paid", () => {
    const totals = profitTotals([
      row({ revenueFils: 10000, costedRevenueFils: 10000, costFils: 6000, profitFils: 4000 }),
      row({ revenueFils: 5000, costedRevenueFils: 5000, costFils: 4000, profitFils: 1000 }),
    ]);
    assert.equal(totals.revenueFils, 15000);
    assert.equal(totals.costFils, 10000);
    assert.equal(totals.profitFils, 5000);
    assert.equal(totals.marginPercent, 33.3);
  });

  it("leaves an uncosted product out of the profit, but not out of revenue", () => {
    // The rule that shapes margin.ts, one level up: a missing cost is unknown,
    // never zero. Counting this line's revenue as profit would report a margin
    // nobody earned.
    const totals = profitTotals([
      row({ revenueFils: 10000, costedRevenueFils: 10000, costFils: 6000, profitFils: 4000 }),
      row({
        revenueFils: 90000,
        costedRevenueFils: 0,
        costFils: null,
        profitFils: null,
        marginPercent: null,
        units: 30,
        uncostedUnits: 30,
      }),
    ]);
    assert.equal(totals.revenueFils, 100000, "all of it was still sold");
    assert.equal(totals.profitFils, 4000, "only the costed part earns");
    assert.equal(totals.costedRevenueFils, 10000);
    assert.equal(totals.uncostedRevenueFils, 90000);
    // 40% of the part we can judge — NOT 4% of everything, which would be the
    // figure if the unknown line were treated as free.
    assert.equal(totals.marginPercent, 40);
  });

  it("counts units and products whether costed or not", () => {
    const totals = profitTotals([
      row({ units: 10 }),
      row({ units: 5, uncostedUnits: 5, costFils: null, profitFils: null }),
    ]);
    assert.equal(totals.unitsSold, 15);
    assert.equal(totals.uncostedUnits, 5);
    assert.equal(totals.productsSold, 2);
    assert.equal(totals.productsCosted, 1);
  });

  it("says it cannot judge the margin rather than reporting zero", () => {
    const totals = profitTotals([
      row({ revenueFils: 5000, costedRevenueFils: 0, costFils: null, profitFils: null }),
    ]);
    assert.equal(totals.marginPercent, null, "0% would read as 'we made nothing'");
    assert.equal(totals.profitFils, 0);
  });

  it("handles a loss without pretending it is a gain", () => {
    const totals = profitTotals([
      row({ revenueFils: 4000, costedRevenueFils: 4000, costFils: 6000, profitFils: -2000 }),
    ]);
    assert.equal(totals.profitFils, -2000);
    assert.equal(totals.marginPercent, -50);
  });

  it("returns zeroes for nothing sold", () => {
    const totals = profitTotals([]);
    assert.equal(totals.revenueFils, 0);
    assert.equal(totals.profitFils, 0);
    assert.equal(totals.marginPercent, null);
  });
});

describe("byProfit", () => {
  it("ranks on gross profit, not on margin", () => {
    // 8% of a pallet beats 60% of one box, and a table sorted by percentage
    // would put the trivial line first.
    const pallet = row({ name: "Pallet", profitFils: 80000, marginPercent: 8 });
    const box = row({ name: "Box", profitFils: 600, marginPercent: 60 });
    assert.deepEqual(
      byProfit([box, pallet]).map((r) => r.name),
      ["Pallet", "Box"]
    );
  });

  it("sinks uncosted products below everything judgeable", () => {
    const unknown = row({ name: "Unknown", profitFils: null, costFils: null });
    const small = row({ name: "Small", profitFils: 1 });
    assert.deepEqual(
      byProfit([unknown, small]).map((r) => r.name),
      ["Small", "Unknown"]
    );
  });

  it("orders the uncosted ones among themselves by revenue", () => {
    // They are the ones to go and cost, biggest first.
    const big = row({ name: "Big", profitFils: null, costFils: null, revenueFils: 90000 });
    const little = row({ name: "Little", profitFils: null, costFils: null, revenueFils: 100 });
    assert.deepEqual(
      byProfit([little, big]).map((r) => r.name),
      ["Big", "Little"]
    );
  });

  it("does not modify what it was given", () => {
    const rows = [row({ name: "A", profitFils: 1 }), row({ name: "B", profitFils: 2 })];
    byProfit(rows);
    assert.deepEqual(rows.map((r) => r.name), ["A", "B"]);
  });
});

describe("losingMoney", () => {
  it("finds what sells at or below cost, worst first", () => {
    const bad = row({ name: "Bad", profitFils: -500 });
    const worse = row({ name: "Worse", profitFils: -900 });
    const flat = row({ name: "Flat", profitFils: 0 });
    const fine = row({ name: "Fine", profitFils: 100 });
    assert.deepEqual(
      losingMoney([bad, fine, worse, flat]).map((r) => r.name),
      ["Worse", "Bad", "Flat"]
    );
  });

  it("never counts an unknown cost as a loss", () => {
    // Selling something we have not costed is not evidence of anything.
    assert.deepEqual(losingMoney([row({ profitFils: null, costFils: null })]), []);
  });
});
