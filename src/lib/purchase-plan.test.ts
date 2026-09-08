import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allocateReceipt,
  chooseSupply,
  planPurchaseOrders,
  type DemandLine,
  type ReservedAllocation,
  type SupplyOption,
  type SupplyRank,
} from "./purchase-plan.ts";

const supply = (
  rank: SupplyRank,
  name: string,
  available = true,
  costFils: number | null = 1000
): SupplyOption => ({
  supplierId: `sup-${name}`,
  supplierName: name,
  rank,
  available,
  costFils,
  supplierPartNumber: `${name.slice(0, 3).toUpperCase()}-1`,
});

const demand = (
  orderItemId: string,
  skuCode: string,
  qty: number,
  supplies: SupplyOption[]
): DemandLine => ({
  orderItemId,
  skuId: `sku-${skuCode}`,
  skuCode,
  name: `Product ${skuCode}`,
  qty,
  supplies,
});

describe("choosing a supplier", () => {
  it("prefers the primary", () => {
    const chosen = chooseSupply([supply("Backup", "Beta"), supply("Primary", "Alpha")]);
    assert.equal(chosen?.supplierName, "Alpha");
  });

  it("falls back when the primary cannot supply", () => {
    const chosen = chooseSupply([
      supply("Primary", "Alpha", false),
      supply("Backup", "Beta"),
    ]);
    assert.equal(chosen?.supplierName, "Beta");
  });

  it("returns nothing when neither can supply", () => {
    assert.equal(
      chooseSupply([supply("Primary", "Alpha", false), supply("Backup", "Beta", false)]),
      null
    );
  });

  /*
   * The third slot. Added late, and the reason these tests exist is that the
   * ways it silently fails all look like "nothing happened": a preference
   * chain that stops at the backup never reaches it, and a rank mapping that
   * coerced unknown values to Primary would have sent it the order FIRST.
   */
  it("falls through to the third when neither of the first two can supply", () => {
    const chosen = chooseSupply([
      supply("Primary", "Alpha", false),
      supply("Backup", "Beta", false),
      supply("Third", "Gamma"),
    ]);
    assert.equal(chosen?.supplierName, "Gamma");
  });

  it("never prefers the third over a primary that can supply", () => {
    const chosen = chooseSupply([
      supply("Third", "Gamma"),
      supply("Backup", "Beta"),
      supply("Primary", "Alpha"),
    ]);
    assert.equal(chosen?.supplierName, "Alpha");
  });

  it("never prefers the third over a backup that can supply", () => {
    const chosen = chooseSupply([
      supply("Third", "Gamma"),
      supply("Primary", "Alpha", false),
      supply("Backup", "Beta"),
    ]);
    assert.equal(chosen?.supplierName, "Beta");
  });

  it("returns nothing when all three are unavailable", () => {
    assert.equal(
      chooseSupply([
        supply("Primary", "Alpha", false),
        supply("Backup", "Beta", false),
        supply("Third", "Gamma", false),
      ]),
      null
    );
  });

  it("marks anything but the primary as a fallback on the plan", () => {
    const line = (rank: SupplyRank): DemandLine => ({
      orderItemId: `oi-${rank}`,
      skuId: "sku-1",
      skuCode: "SKU-1",
      name: "Gloves",
      qty: 1,
      supplies: [supply(rank, rank)],
    });

    for (const [rank, expected] of [
      ["Primary", false],
      ["Backup", true],
      ["Third", true],
    ] as const) {
      const plan = planPurchaseOrders([line(rank)]);
      assert.equal(
        plan.orders[0].lines[0].wasFallback,
        expected,
        `${rank} should ${expected ? "" : "not "}be a fallback`
      );
    }
  });

  it("returns nothing when no supplier is recorded at all", () => {
    assert.equal(chooseSupply([]), null);
  });
});

describe("pooling demand into purchase orders", () => {
  /** The whole point: many small customer orders become one supplier order. */
  it("sums quantities for the same item across customers", () => {
    const plan = planPurchaseOrders([
      demand("oi-1", "GLOVE-M", 5, [supply("Primary", "Alpha")]),
      demand("oi-2", "GLOVE-M", 3, [supply("Primary", "Alpha")]),
      demand("oi-3", "GLOVE-M", 2, [supply("Primary", "Alpha")]),
    ]);

    assert.equal(plan.orders.length, 1);
    assert.equal(plan.orders[0].lines.length, 1);
    assert.equal(plan.orders[0].lines[0].qtyOrdered, 10);
  });

  it("keeps which customer each unit belongs to", () => {
    const plan = planPurchaseOrders([
      demand("oi-1", "GLOVE-M", 5, [supply("Primary", "Alpha")]),
      demand("oi-2", "GLOVE-M", 3, [supply("Primary", "Alpha")]),
    ]);

    const allocations = plan.orders[0].lines[0].allocations;
    assert.deepEqual(allocations, [
      { orderItemId: "oi-1", qty: 5 },
      { orderItemId: "oi-2", qty: 3 },
    ]);
    assert.equal(
      allocations.reduce((n, a) => n + a.qty, 0),
      plan.orders[0].lines[0].qtyOrdered
    );
  });

  it("gives each supplier their own order", () => {
    const plan = planPurchaseOrders([
      demand("oi-1", "GLOVE-M", 5, [supply("Primary", "Alpha")]),
      demand("oi-2", "MASK-N95", 4, [supply("Primary", "Beta")]),
    ]);

    assert.equal(plan.orders.length, 2);
    assert.deepEqual(
      plan.orders.map((o) => o.supplierName),
      ["Alpha", "Beta"]
    );
  });

  it("marks lines that fell back, so a reviewer can see them", () => {
    const plan = planPurchaseOrders([
      demand("oi-1", "GLOVE-M", 5, [
        supply("Primary", "Alpha", false),
        supply("Backup", "Beta"),
      ]),
      demand("oi-2", "MASK-N95", 4, [supply("Primary", "Beta")]),
    ]);

    // Both land with Beta, but only one of them is a fallback.
    assert.equal(plan.orders.length, 1);
    const byCode = Object.fromEntries(plan.orders[0].lines.map((l) => [l.skuCode, l]));
    assert.equal(byCode["GLOVE-M"].wasFallback, true);
    assert.equal(byCode["MASK-N95"].wasFallback, false);
  });

  it("totals the cost when every line has one", () => {
    const plan = planPurchaseOrders([
      demand("oi-1", "GLOVE-M", 5, [supply("Primary", "Alpha", true, 1000)]),
      demand("oi-2", "MASK-N95", 2, [supply("Primary", "Alpha", true, 250)]),
    ]);
    assert.equal(plan.orders[0].totalCostFils, 5 * 1000 + 2 * 250);
  });

  /** A total that treats an unknown cost as zero would be believed. */
  it("refuses a total when any cost is unrecorded", () => {
    const plan = planPurchaseOrders([
      demand("oi-1", "GLOVE-M", 5, [supply("Primary", "Alpha", true, 1000)]),
      demand("oi-2", "MASK-N95", 2, [supply("Primary", "Alpha", true, null)]),
    ]);
    assert.equal(plan.orders[0].totalCostFils, null);
  });

  it("is deterministic — same demand, same document", () => {
    const lines = [
      demand("oi-1", "ZZ-9", 1, [supply("Primary", "Zeta")]),
      demand("oi-2", "AA-1", 1, [supply("Primary", "Alpha")]),
      demand("oi-3", "MM-5", 1, [supply("Primary", "Alpha")]),
    ];
    const first = planPurchaseOrders(lines);
    const second = planPurchaseOrders([...lines].reverse());

    assert.deepEqual(
      first.orders.map((o) => o.supplierName),
      second.orders.map((o) => o.supplierName)
    );
    assert.deepEqual(
      first.orders[0].lines.map((l) => l.skuCode),
      second.orders[0].lines.map((l) => l.skuCode)
    );
  });
});

describe("lines nobody can supply", () => {
  it("surfaces them instead of dropping them", () => {
    const plan = planPurchaseOrders([
      demand("oi-1", "GLOVE-M", 5, [
        supply("Primary", "Alpha", false),
        supply("Backup", "Beta", false),
      ]),
      demand("oi-2", "MASK-N95", 4, [supply("Primary", "Alpha")]),
    ]);

    assert.equal(plan.unsourceable.length, 1);
    assert.equal(plan.unsourceable[0].skuCode, "GLOVE-M");
    assert.equal(plan.unsourceable[0].qty, 5);
    // And the rest of the day's buying is unaffected.
    assert.equal(plan.orders.length, 1);
    assert.equal(plan.orders[0].lines[0].skuCode, "MASK-N95");
  });

  it("says why, naming both suppliers", () => {
    const plan = planPurchaseOrders([
      demand("oi-1", "GLOVE-M", 5, [
        supply("Primary", "Alpha", false),
        supply("Backup", "Beta", false),
      ]),
    ]);
    assert.match(plan.unsourceable[0].reason, /Alpha \(primary\)/);
    assert.match(plan.unsourceable[0].reason, /Beta \(backup\)/);
  });

  it("distinguishes having no supplier from having unavailable ones", () => {
    const plan = planPurchaseOrders([demand("oi-1", "ORPHAN", 1, [])]);
    assert.match(plan.unsourceable[0].reason, /No supplier is recorded/);
  });
});

describe("sharing out a delivery", () => {
  const reserved = (allocationId: string, qty: number, placedAt: number): ReservedAllocation => ({
    allocationId,
    qty,
    placedAt,
  });

  const early = reserved("a-early", 4, 1000);
  const middle = reserved("b-middle", 3, 2000);
  const late = reserved("c-late", 3, 3000);

  it("fills everyone when the full quantity arrives", () => {
    const filled = allocateReceipt(10, [early, middle, late]);
    assert.deepEqual(
      filled.map((f) => [f.allocationId, f.filled]),
      [["a-early", 4], ["b-middle", 3], ["c-late", 3]]
    );
    assert.equal(filled.every((f) => f.shortfall === 0), true);
  });

  /** The point of the rule: two clinics get a usable quantity, not three
   *  clinics getting two-thirds of a box each. */
  it("serves earliest orders in full and puts the shortfall on the newest", () => {
    const filled = allocateReceipt(7, [late, early, middle]);
    const byId = Object.fromEntries(filled.map((f) => [f.allocationId, f]));

    assert.equal(byId["a-early"].filled, 4);
    assert.equal(byId["b-middle"].filled, 3);
    assert.equal(byId["c-late"].filled, 0);
    assert.equal(byId["c-late"].shortfall, 3);
  });

  it("part-fills only the line the shortfall lands on", () => {
    const filled = allocateReceipt(6, [early, middle, late]);
    const byId = Object.fromEntries(filled.map((f) => [f.allocationId, f]));

    assert.equal(byId["a-early"].filled, 4);
    assert.equal(byId["b-middle"].filled, 2);
    assert.equal(byId["b-middle"].shortfall, 1);
    assert.equal(byId["c-late"].filled, 0);
  });

  it("gives nobody anything when nothing arrives", () => {
    const filled = allocateReceipt(0, [early, middle]);
    assert.equal(filled.every((f) => f.filled === 0), true);
    assert.equal(
      filled.reduce((n, f) => n + f.shortfall, 0),
      7
    );
  });

  it("never hands out more than was reserved, even on an over-delivery", () => {
    const filled = allocateReceipt(50, [early, middle]);
    assert.equal(filled.reduce((n, f) => n + f.filled, 0), 7);
  });

  it("shares out the same way every time, whatever order it is given", () => {
    const a = allocateReceipt(5, [early, middle, late]);
    const b = allocateReceipt(5, [late, middle, early]);
    const key = (f: { allocationId: string; filled: number }[]) =>
      [...f].sort((x, y) => x.allocationId.localeCompare(y.allocationId))
        .map((v) => `${v.allocationId}:${v.filled}`)
        .join(",");
    assert.equal(key(a), key(b));
  });

  it("treats a negative receipt as nothing arriving", () => {
    const filled = allocateReceipt(-5, [early]);
    assert.equal(filled[0].filled, 0);
  });
});

describe("nothing to buy", () => {
  it("produces no orders from no demand", () => {
    const plan = planPurchaseOrders([]);
    assert.deepEqual(plan.orders, []);
    assert.deepEqual(plan.unsourceable, []);
  });

  it("ignores lines already fully bought", () => {
    const plan = planPurchaseOrders([
      demand("oi-1", "GLOVE-M", 0, [supply("Primary", "Alpha")]),
    ]);
    assert.deepEqual(plan.orders, []);
    assert.deepEqual(plan.unsourceable, []);
  });
});
