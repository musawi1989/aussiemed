import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accountMetrics, median, type OrderSummary } from "./account-metrics.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 16);

/** n days before "now", so a test reads as "they ordered 21 days ago". */
const daysAgo = (n: number, totalFils = 10_000): OrderSummary => ({
  placedAt: NOW - n * DAY,
  totalFils,
});

describe("median", () => {
  it("takes the middle of an odd list", () => {
    assert.equal(median([9, 1, 5]), 5);
  });

  it("averages the middle pair of an even list", () => {
    assert.equal(median([10, 20, 30, 40]), 25);
  });

  it("has nothing to return for an empty list", () => {
    assert.equal(median([]), null);
  });
});

describe("an account with no orders", () => {
  it("reports zeroes rather than dividing by none", () => {
    const m = accountMetrics([], NOW);
    assert.equal(m.orderCount, 0);
    assert.equal(m.totalSpentFils, 0);
    assert.equal(m.averageOrderFils, 0);
    assert.equal(m.cadenceDays, null);
    assert.equal(m.lastOrderAt, null);
    assert.equal(m.overdue, false);
  });
});

describe("spend", () => {
  it("totals and averages what they have spent", () => {
    const m = accountMetrics(
      [daysAgo(30, 10_000), daysAgo(20, 20_000), daysAgo(10, 30_000)],
      NOW
    );
    assert.equal(m.orderCount, 3);
    assert.equal(m.totalSpentFils, 60_000);
    assert.equal(m.averageOrderFils, 20_000);
  });

  it("rounds the average to whole fils, never a fraction of one", () => {
    const m = accountMetrics([daysAgo(2, 10_000), daysAgo(1, 10_001)], NOW);
    assert.ok(Number.isInteger(m.averageOrderFils));
  });
});

describe("how often they order", () => {
  it("waits for three orders before claiming a rhythm", () => {
    const two = accountMetrics([daysAgo(40), daysAgo(20)], NOW);
    assert.equal(two.cadenceDays, null, "two orders is one gap, not a pattern");

    const three = accountMetrics([daysAgo(60), daysAgo(40), daysAgo(20)], NOW);
    assert.equal(three.cadenceDays, 20);
  });

  /** The reason it is a median: one shutdown must not rewrite the rhythm. */
  it("is not dragged out by a single long gap", () => {
    const m = accountMetrics(
      [daysAgo(400), daysAgo(60), daysAgo(40), daysAgo(20)],
      NOW
    );
    assert.equal(m.cadenceDays, 20);
  });

  it("counts the days since the last order", () => {
    const m = accountMetrics([daysAgo(60), daysAgo(40), daysAgo(7)], NOW);
    assert.equal(m.daysSinceLastOrder, 7);
  });
});

describe("overdue", () => {
  it("stays quiet inside the usual rhythm", () => {
    // Orders every 20 days, last one 21 days ago — normal.
    const m = accountMetrics([daysAgo(61), daysAgo(41), daysAgo(21)], NOW);
    assert.equal(m.cadenceDays, 20);
    assert.equal(m.overdue, false);
  });

  it("fires once they are half as long again overdue", () => {
    // Every 20 days, last one 31 days ago — past 30.
    const m = accountMetrics([daysAgo(71), daysAgo(51), daysAgo(31)], NOW);
    assert.equal(m.overdue, true);
  });

  it("says nothing about a customer whose rhythm is not known yet", () => {
    const m = accountMetrics([daysAgo(400)], NOW);
    assert.equal(m.cadenceDays, null);
    assert.equal(m.overdue, false, "one old order is not evidence of a habit");
  });
});
