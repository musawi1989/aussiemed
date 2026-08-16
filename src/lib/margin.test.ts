import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  lineMargin,
  marginBand,
  marginOf,
  realisedCost,
  totalMargin,
} from "./margin.ts";

describe("marginOf", () => {
  it("computes margin, percent of sell, and markup on cost", () => {
    // Bought at 60.00, sold at 100.00.
    const m = marginOf(10_000, 6_000);
    assert.equal(m.marginFils, 4_000);
    assert.equal(m.marginPercent, 40);
    assert.equal(m.markupPercent, 66.7);
    assert.equal(m.losing, false);
  });

  it("treats a missing cost as unknown, never as zero", () => {
    // The whole point: cost arrives with the real catalogue, and zero would
    // show a 100% margin on every product not yet loaded — and be believed.
    const m = marginOf(10_000, null);
    assert.equal(m.costFils, null);
    assert.equal(m.marginFils, null);
    assert.equal(m.marginPercent, null);
    assert.equal(m.markupPercent, null);
    assert.equal(m.losing, false);
    assert.notEqual(m.marginPercent, 100);
  });

  it("treats undefined and NaN as unknown too", () => {
    assert.equal(marginOf(10_000, undefined as never).marginPercent, null);
    assert.equal(marginOf(10_000, Number.NaN).marginPercent, null);
  });

  it("reports a real zero cost as a real 100% margin", () => {
    // Distinct from unknown: a genuinely free line is not a missing one.
    const m = marginOf(10_000, 0);
    assert.equal(m.costFils, 0);
    assert.equal(m.marginFils, 10_000);
    assert.equal(m.marginPercent, 100);
    assert.equal(m.markupPercent, null); // dividing by a zero cost
  });

  it("flags selling below cost", () => {
    const m = marginOf(5_000, 6_000);
    assert.equal(m.marginFils, -1_000);
    assert.equal(m.marginPercent, -20);
    assert.equal(m.losing, true);
  });

  it("does not call an even trade a loss", () => {
    const m = marginOf(6_000, 6_000);
    assert.equal(m.marginFils, 0);
    assert.equal(m.marginPercent, 0);
    assert.equal(m.losing, false);
  });

  it("never renders Infinity from a zero sell price", () => {
    const m = marginOf(0, 6_000);
    assert.equal(m.marginPercent, null);
    assert.equal(m.marginFils, -6_000);
    assert.equal(m.losing, true);
  });

  it("stays in whole fils rather than drifting into floats", () => {
    const m = marginOf(10_001, 3_334);
    assert.equal(m.marginFils, 6_667);
    assert.ok(Number.isInteger(m.marginFils));
  });

  it("rounds percentages to one decimal", () => {
    assert.equal(marginOf(3_000, 1_000).marginPercent, 66.7);
    assert.equal(marginOf(3_000, 1_000).markupPercent, 200);
  });
});

describe("marginBand", () => {
  it("keeps unknown out of the bad bands", () => {
    // A product whose cost has not been loaded is not a low-margin product,
    // and colouring it as one sends somebody to renegotiate a fine price.
    assert.equal(marginBand(marginOf(10_000, null)), "unknown");
  });

  it("separates a loss from a thin margin", () => {
    assert.equal(marginBand(marginOf(5_000, 6_000)), "loss");
    assert.equal(marginBand(marginOf(10_000, 9_500)), "thin");
  });

  it("bands fair and good", () => {
    assert.equal(marginBand(marginOf(10_000, 8_000)), "fair"); // 20%
    assert.equal(marginBand(marginOf(10_000, 7_000)), "good"); // 30%
  });

  it("puts the boundaries where the comments say", () => {
    assert.equal(marginBand(marginOf(10_000, 9_000)), "fair"); // exactly 10%
    assert.equal(marginBand(marginOf(10_000, 7_500)), "good"); // exactly 25%
  });
});

describe("realisedCost", () => {
  it("sums what the received units actually cost", () => {
    const r = realisedCost(10, [
      { qty: 6, unitCostFilsSnapshot: 500 },
      { qty: 4, unitCostFilsSnapshot: 520 },
    ]);
    assert.equal(r.qtyCosted, 10);
    assert.equal(r.costFils, 6 * 500 + 4 * 520);
    assert.equal(r.complete, true);
    assert.equal(r.qtyOutstanding, 0);
  });

  it("handles two purchase orders at different prices for one line", () => {
    // A short delivery topped up from a later run, bought at a new price.
    const r = realisedCost(5, [
      { qty: 3, unitCostFilsSnapshot: 500 },
      { qty: 2, unitCostFilsSnapshot: 700 },
    ]);
    assert.equal(r.costFils, 2_900);
    assert.equal(r.complete, true);
  });

  it("reports a part-delivered line as incomplete with the balance", () => {
    const r = realisedCost(10, [{ qty: 3, unitCostFilsSnapshot: 500 }]);
    assert.equal(r.qtyCosted, 3);
    assert.equal(r.qtyOutstanding, 7);
    assert.equal(r.complete, false);
  });

  it("is not complete when nothing has been allocated", () => {
    const r = realisedCost(10, []);
    assert.equal(r.costFils, null);
    assert.equal(r.complete, false);
    assert.equal(r.qtyOutstanding, 10);
  });

  it("does not call a zero-quantity line complete", () => {
    assert.equal(realisedCost(0, []).complete, false);
  });

  it("refuses to treat an uncosted purchase order line as free", () => {
    // The defect this replaced: purchasing wrote `unitCostFils ?? 0`, so a
    // supply with no recorded cost produced a purchase order line costing
    // nothing, and the order it fulfilled reported a 100% margin.
    const r = realisedCost(10, [{ qty: 10, unitCostFilsSnapshot: null }]);
    assert.equal(r.qtyReceived, 10);
    assert.equal(r.qtyCosted, 0);
    assert.equal(r.qtyUncosted, 10);
    assert.equal(r.costFils, null);
    assert.equal(r.complete, false);
    // Received in full, so nothing is outstanding — it simply cannot be priced.
    assert.equal(r.qtyOutstanding, 0);
  });

  it("counts only the costed part when a line was bought twice", () => {
    const r = realisedCost(10, [
      { qty: 6, unitCostFilsSnapshot: 500 },
      { qty: 4, unitCostFilsSnapshot: null },
    ]);
    assert.equal(r.qtyReceived, 10);
    assert.equal(r.qtyCosted, 6);
    assert.equal(r.qtyUncosted, 4);
    assert.equal(r.costFils, 3_000);
    // Six of ten priced is not a priced line.
    assert.equal(r.complete, false);
  });

  it("still honours a genuine zero cost", () => {
    // Null is unknown; zero is free. They must not collapse into each other.
    const r = realisedCost(2, [{ qty: 2, unitCostFilsSnapshot: 0 }]);
    assert.equal(r.costFils, 0);
    assert.equal(r.qtyCosted, 2);
    assert.equal(r.complete, true);
  });
});

describe("lineMargin", () => {
  it("reports margin once the whole line has been bought", () => {
    const m = lineMargin(10_000, 10, [{ qty: 10, unitCostFilsSnapshot: 600 }]);
    assert.equal(m.costFils, 6_000);
    assert.equal(m.marginFils, 4_000);
    assert.equal(m.complete, true);
  });

  it("refuses to report a margin on a part-delivered line", () => {
    // Three of ten received would otherwise show a margin far better than the
    // real one, on the screen whose job is deciding if the trade is worth it.
    const m = lineMargin(10_000, 10, [{ qty: 3, unitCostFilsSnapshot: 600 }]);
    assert.equal(m.marginFils, null);
    assert.equal(m.marginPercent, null);
    assert.equal(m.complete, false);
    assert.equal(m.qtyOutstanding, 7);
  });

  it("reports nothing on a line not yet purchased at all", () => {
    const m = lineMargin(10_000, 10, []);
    assert.equal(m.marginPercent, null);
    assert.equal(m.complete, false);
  });

  it("reports nothing on a line delivered in full but never costed", () => {
    // This is the case that used to read "+100%" on the order screen.
    const m = lineMargin(10_000, 10, [{ qty: 10, unitCostFilsSnapshot: null }]);
    assert.equal(m.costFils, null);
    assert.equal(m.marginPercent, null);
    assert.notEqual(m.marginPercent, 100);
    assert.equal(m.complete, false);
    assert.equal(m.qtyUncosted, 10);
    assert.equal(m.qtyOutstanding, 0);
  });
});

describe("totalMargin", () => {
  it("adds up the lines whose cost is known", () => {
    const t = totalMargin([
      { sellFils: 10_000, costFils: 6_000 },
      { sellFils: 5_000, costFils: 4_000 },
    ]);
    assert.equal(t.sellFils, 15_000);
    assert.equal(t.costFils, 10_000);
    assert.equal(t.marginFils, 5_000);
    assert.equal(t.linesCosted, 2);
    assert.equal(t.linesUnknown, 0);
  });

  it("counts the uncosted lines rather than swallowing them", () => {
    // A total that quietly excludes two lines without saying so is the same
    // lie as calling their cost zero.
    const t = totalMargin([
      { sellFils: 10_000, costFils: 6_000 },
      { sellFils: 5_000, costFils: null },
      { sellFils: 2_000, costFils: null },
    ]);
    assert.equal(t.sellFils, 10_000);
    assert.equal(t.marginFils, 4_000);
    assert.equal(t.linesCosted, 1);
    assert.equal(t.linesUnknown, 2);
  });

  it("reports unknown rather than zero when no line has a cost", () => {
    const t = totalMargin([
      { sellFils: 10_000, costFils: null },
      { sellFils: 5_000, costFils: null },
    ]);
    assert.equal(t.marginFils, null);
    assert.equal(t.marginPercent, null);
    assert.equal(t.linesCosted, 0);
    assert.equal(t.linesUnknown, 2);
    assert.equal(marginBand(t), "unknown");
  });

  it("handles an empty order without producing NaN", () => {
    const t = totalMargin([]);
    assert.equal(t.marginFils, null);
    assert.equal(t.linesCosted, 0);
    assert.equal(t.linesUnknown, 0);
  });

  it("carries a loss through to the total", () => {
    const t = totalMargin([
      { sellFils: 10_000, costFils: 6_000 },
      { sellFils: 2_000, costFils: 9_000 },
    ]);
    assert.equal(t.marginFils, -3_000);
    assert.equal(t.losing, true);
    assert.equal(marginBand(t), "loss");
  });
});
