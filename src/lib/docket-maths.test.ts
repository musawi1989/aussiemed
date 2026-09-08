import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkDocket,
  hasDocketed,
  isFullyDocketed,
  planLines,
  statusAfterDocket,
  toFollowAfter,
  type DocketableLine,
} from "./docket-maths.ts";

const line = (
  id: string,
  qtyOrdered: number,
  docketed = 0,
  qtyConfirmed: number | null = null
): DocketableLine => ({
  id,
  name: `Item ${id}`,
  skuCode: `SKU-${id}`,
  qtyOrdered,
  qtyConfirmed,
  docketed,
});

describe("planLines", () => {
  it("owes the whole quantity when nothing has been docketed", () => {
    const [row] = planLines([line("a", 10)]);
    assert.equal(row.outstanding, 10);
    assert.equal(row.suggested, 10);
    assert.equal(row.settled, false);
  });

  it("subtracts what has already gone", () => {
    const [row] = planLines([line("a", 10, 4)]);
    assert.equal(row.outstanding, 6);
    assert.equal(row.suggested, 6);
  });

  it("settles a line that has been sent in full", () => {
    const [row] = planLines([line("a", 10, 10)]);
    assert.equal(row.outstanding, 0);
    assert.equal(row.settled, true);
  });

  it("never goes negative when more arrived than was ordered", () => {
    const [row] = planLines([line("a", 10, 12)]);
    assert.equal(row.outstanding, 0);
    assert.equal(row.settled, true);
  });

  it("ignores qtyConfirmed entirely — the promise does not reduce what is owed", () => {
    // Promised none, sent none: still owes all ten. If the promise drove the
    // arithmetic this would read as settled and the line would vanish.
    const [row] = planLines([line("a", 10, 0, 0)]);
    assert.equal(row.outstanding, 10);
    assert.equal(row.settled, false);
  });

  it("lets a supplier send more than they promised", () => {
    const rows = planLines([line("a", 10, 0, 4)]);
    assert.equal(rows[0].outstanding, 10);
    assert.equal(checkDocket([line("a", 10, 0, 4)], [{ purchaseOrderLineId: "a", qty: 9 }]).ok, true);
  });
});

describe("isFullyDocketed / hasDocketed", () => {
  it("is complete only when every line is settled", () => {
    assert.equal(isFullyDocketed([line("a", 2, 2), line("b", 3, 3)]), true);
    assert.equal(isFullyDocketed([line("a", 2, 2), line("b", 3, 1)]), false);
  });

  it("separates nothing-sent from part-sent", () => {
    assert.equal(hasDocketed([line("a", 2, 0)]), false);
    assert.equal(hasDocketed([line("a", 2, 1)]), true);
  });
});

describe("checkDocket", () => {
  const lines = [line("a", 10, 4), line("b", 5)];

  it("accepts a docket within what is outstanding", () => {
    const result = checkDocket(lines, [
      { purchaseOrderLineId: "a", qty: 6 },
      { purchaseOrderLineId: "b", qty: 5 },
    ]);
    assert.equal(result.ok, true);
  });

  it("drops zero lines rather than refusing them", () => {
    const result = checkDocket(lines, [
      { purchaseOrderLineId: "a", qty: 0 },
      { purchaseOrderLineId: "b", qty: 2 },
    ]);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.lines, [{ purchaseOrderLineId: "b", qty: 2 }]);
  });

  it("refuses an empty docket", () => {
    const result = checkDocket(lines, [{ purchaseOrderLineId: "a", qty: 0 }]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Nothing is on this docket/);
  });

  it("refuses more than is outstanding rather than clamping", () => {
    const result = checkDocket(lines, [{ purchaseOrderLineId: "a", qty: 7 }]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /only 6 of 10 are still outstanding/);
  });

  it("says so plainly when a line is already complete", () => {
    const result = checkDocket([line("a", 4, 4)], [{ purchaseOrderLineId: "a", qty: 1 }]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /already been sent in full/);
  });

  it("refuses a line listed twice", () => {
    const result = checkDocket(lines, [
      { purchaseOrderLineId: "b", qty: 1 },
      { purchaseOrderLineId: "b", qty: 1 },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /appears twice/);
  });

  it("refuses fractions", () => {
    const result = checkDocket(lines, [{ purchaseOrderLineId: "b", qty: 1.5 }]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /whole number/);
  });

  it("refuses a line that is not on the order", () => {
    const result = checkDocket(lines, [{ purchaseOrderLineId: "zzz", qty: 1 }]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /not on this purchase order/);
  });
});

describe("statusAfterDocket", () => {
  it("is PartiallyDispatched while anything is still owed", () => {
    assert.equal(statusAfterDocket("Sent", [line("a", 10, 6)]), "PartiallyDispatched");
  });

  it("is Dispatched once everything has gone", () => {
    assert.equal(statusAfterDocket("PartiallyDispatched", [line("a", 10, 10)]), "Dispatched");
  });

  it("does not drag a receiving order backwards — BE-77", () => {
    assert.equal(statusAfterDocket("PartiallyReceived", [line("a", 10, 10)]), "PartiallyReceived");
    assert.equal(statusAfterDocket("Received", [line("a", 10, 10)]), "Received");
  });

  it("leaves a cancelled order cancelled", () => {
    assert.equal(statusAfterDocket("Cancelled", [line("a", 10, 10)]), "Cancelled");
  });
});

describe("toFollowAfter", () => {
  const lines = [
    { ...line("a", 10), dockets: [{ sequence: 1, qty: 6 }, { sequence: 2, qty: 4 }] },
    { ...line("b", 5), dockets: [{ sequence: 1, qty: 5 }] },
  ];

  it("lists what docket 1 left behind", () => {
    assert.deepEqual(toFollowAfter(lines, 1), [
      { name: "Item a", skuCode: "SKU-a", qty: 4 },
    ]);
  });

  it("lists nothing after the final docket", () => {
    assert.deepEqual(toFollowAfter(lines, 2), []);
  });

  it("does not change a reprinted docket 1 after docket 2 has gone", () => {
    // The same call as the first test, made when both dockets exist. A
    // document that changes meaning after the fact is worse than no document.
    assert.equal(toFollowAfter(lines, 1)[0].qty, 4);
  });
});
