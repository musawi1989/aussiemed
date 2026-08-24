import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterOrders,
  hasActiveFilters,
  matchesFilters,
  paymentOptions,
  periodStart,
  statusOptions,
} from "./order-filters.ts";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const order = (over: Partial<Parameters<typeof matchesFilters>[0]> = {}) => ({
  reference: "AM-2026-000010",
  poReference: null,
  status: "Processing",
  placedAt: daysAgo(1),
  paymentStatus: "Unpaid",
  paymentDueOn: inDays(14),
  ...over,
});

describe("filtering an order list", () => {
  it("returns everything when nothing is set", () => {
    // The failure to avoid is a page that loads empty because a filter
    // defaulted to something nobody chose.
    const rows = [order(), order({ reference: "AM-2026-000011" })];
    assert.equal(filterOrders(rows, {}, NOW).length, 2);
    assert.equal(filterOrders(rows, { q: "", status: "", payment: "" }, NOW).length, 2);
  });

  it("finds an order by its reference", () => {
    const rows = [order(), order({ reference: "AM-2026-000099" })];
    assert.deepEqual(
      filterOrders(rows, { q: "000099" }, NOW).map((o) => o.reference),
      ["AM-2026-000099"]
    );
  });

  it("finds an order by the customer's own PO number", () => {
    // The number they are holding is as likely to be theirs as ours.
    const rows = [order({ poReference: "PO-4471" }), order({ reference: "AM-2026-000011" })];
    assert.equal(filterOrders(rows, { q: "po-4471" }, NOW).length, 1);
    assert.equal(filterOrders(rows, { q: "PO-4471" }, NOW).length, 1);
  });

  it("ignores surrounding spaces in a search", () => {
    assert.equal(filterOrders([order()], { q: "  000010  " }, NOW).length, 1);
  });

  it("filters by fulfilment status", () => {
    const rows = [order({ status: "Delivered" }), order({ status: "Processing" })];
    assert.equal(filterOrders(rows, { status: "Delivered" }, NOW).length, 1);
    assert.equal(filterOrders(rows, { status: "Cancelled" }, NOW).length, 0);
  });
});

describe("filtering by payment, which is not a stored word", () => {
  it("matches overdue by the date, not by the column", () => {
    // The whole point. paymentStatus still reads "Unpaid" in the database on
    // an invoice that fell due yesterday — nothing rewrites it at midnight —
    // so a filter comparing the column would return nothing while the row
    // beside it showed an Overdue pill.
    const late = order({ paymentStatus: "Unpaid", paymentDueOn: inDays(-1) });
    assert.equal(late.paymentStatus, "Unpaid");
    assert.equal(filterOrders([late], { payment: "Overdue" }, NOW).length, 1);
    assert.equal(filterOrders([late], { payment: "Unpaid" }, NOW).length, 0);
  });

  it("matches due soon the same way", () => {
    const soon = order({ paymentStatus: "Unpaid", paymentDueOn: inDays(3) });
    assert.equal(filterOrders([soon], { payment: "DueSoon" }, NOW).length, 1);
  });

  it("leaves a genuinely unpaid invoice as unpaid", () => {
    const open = order({ paymentStatus: "Unpaid", paymentDueOn: inDays(30) });
    assert.equal(filterOrders([open], { payment: "Unpaid" }, NOW).length, 1);
    assert.equal(filterOrders([open], { payment: "Overdue" }, NOW).length, 0);
  });

  it("filters paid orders", () => {
    const rows = [order({ paymentStatus: "Paid" }), order({ paymentStatus: "Unpaid" })];
    assert.equal(filterOrders(rows, { payment: "Paid" }, NOW).length, 1);
  });
});

describe("the period", () => {
  it("counts back from the day it is asked", () => {
    const rows = [
      order({ reference: "recent", placedAt: daysAgo(5) }),
      order({ reference: "old", placedAt: daysAgo(200) }),
    ];
    assert.deepEqual(
      filterOrders(rows, { period: "30" }, NOW).map((o) => o.reference),
      ["recent"]
    );
    assert.equal(filterOrders(rows, { period: "365" }, NOW).length, 2);
  });

  it("treats anything unparseable as no limit at all", () => {
    // "all", an empty string and a typo must never silently hide orders.
    const rows = [order({ placedAt: daysAgo(2000) })];
    for (const period of ["all", "", "banana", undefined]) {
      assert.equal(
        filterOrders(rows, { period }, NOW).length,
        1,
        `period ${String(period)} hid an order`
      );
    }
    assert.equal(periodStart("all", NOW), null);
    assert.equal(periodStart(undefined, NOW), null);
  });
});

describe("the controls the page draws", () => {
  it("labels the options the way the pills are labelled", () => {
    // Two words for one state is how a filter stops being trusted.
    const payment = paymentOptions();
    assert.ok(payment.some((o) => o.value === "DueSoon" && o.label === "Due soon"));
    assert.ok(payment.some((o) => o.value === "PartiallyPaid" && o.label === "Part paid"));
    const status = statusOptions();
    assert.ok(status.some((o) => o.value === "Dispatched"));
    assert.equal(new Set(status.map((o) => o.value)).size, status.length);
  });

  it("knows when something is actually narrowing the list", () => {
    assert.equal(hasActiveFilters({}), false);
    assert.equal(hasActiveFilters({ period: "all" }), false);
    assert.equal(hasActiveFilters({ q: "   " }), false);
    assert.equal(hasActiveFilters({ payment: "Overdue" }), true);
    assert.equal(hasActiveFilters({ branch: "abc" }), true);
    assert.equal(hasActiveFilters({ period: "30" }), true);
  });
});
