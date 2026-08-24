import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { monthKey, monthLabel, monthRange } from "./invoice-months.ts";

/**
 * The month boundary decides which invoice a delivery is paid on, so the
 * interesting cases are all edges: midnight, the last millisecond, February,
 * and December rolling into the next year.
 */
describe("monthKey", () => {
  it("names the month a date falls in", () => {
    assert.equal(monthKey(new Date("2026-08-11T07:15:00Z")), "2026-08");
  });

  it("pads a single-digit month", () => {
    assert.equal(monthKey(new Date("2026-03-04T00:00:00Z")), "2026-03");
  });

  it("reads the month in Dubai, not UTC", () => {
    // 02:00 Dubai on 1 August is 22:00 UTC on 31 July. The warehouse says
    // August, so the invoice says August.
    assert.equal(monthKey(new Date("2026-07-31T22:00:00Z")), "2026-08");
    // And the mirror: 03:00 Dubai on the 1st, still August.
    assert.equal(monthKey(new Date("2026-07-31T23:59:59Z")), "2026-08");
    // 19:59 UTC on the 31st is 23:59 Dubai — the last minute of July.
    assert.equal(monthKey(new Date("2026-07-31T19:59:00Z")), "2026-07");
  });

  it("agrees with the start of its own range", () => {
    for (const month of ["2026-01", "2026-02", "2026-08", "2026-12"]) {
      const range = monthRange(month);
      assert.ok(range);
      assert.equal(monthKey(range.from), month, `${month} start`);
      // The last instant of the month is still that month.
      assert.equal(monthKey(new Date(range.to.getTime() - 1)), month, `${month} end`);
      // And the first instant of the next is not.
      assert.notEqual(monthKey(range.to), month, `${month} rollover`);
    }
  });
});

describe("monthRange", () => {
  it("runs from midnight Dubai to midnight Dubai", () => {
    const range = monthRange("2026-08");
    assert.ok(range);
    // 20:00 UTC on 31 July is 00:00 Dubai on 1 August.
    assert.equal(range.from.toISOString(), "2026-07-31T20:00:00.000Z");
    assert.equal(range.to.toISOString(), "2026-08-31T20:00:00.000Z");
  });

  it("is half-open, so the last second of a 31-day month is included", () => {
    const range = monthRange("2026-07");
    assert.ok(range);
    const lastSecond = new Date("2026-07-31T19:59:59Z"); // 23:59:59 Dubai
    assert.ok(lastSecond >= range.from && lastSecond < range.to);
  });

  it("handles February, including a leap year", () => {
    const short = monthRange("2026-02");
    assert.ok(short);
    assert.equal(short.to.toISOString(), "2026-02-28T20:00:00.000Z");

    const leap = monthRange("2028-02");
    assert.ok(leap);
    assert.equal(leap.to.toISOString(), "2028-02-29T20:00:00.000Z");
  });

  it("rolls December into the next January", () => {
    const range = monthRange("2026-12");
    assert.ok(range);
    assert.equal(range.to.toISOString(), "2026-12-31T20:00:00.000Z");
    assert.equal(monthKey(range.to), "2027-01");
  });

  it("refuses anything that is not a month", () => {
    for (const bad of ["banana", "2026-13", "2026-00", "2026", "2026-8", ""]) {
      assert.equal(monthRange(bad), null, bad);
    }
  });

  it("covers every instant of a year exactly once", () => {
    // Each month's end is the next month's start — no gap to lose a delivery
    // in, and no overlap to bill one twice.
    for (let m = 1; m < 12; m++) {
      const a = monthRange(`2026-${String(m).padStart(2, "0")}`);
      const b = monthRange(`2026-${String(m + 1).padStart(2, "0")}`);
      assert.ok(a && b);
      assert.equal(a.to.getTime(), b.from.getTime(), `${m} -> ${m + 1}`);
    }
  });
});

describe("monthLabel", () => {
  it("reads as a heading", () => {
    assert.equal(monthLabel("2026-08"), "August 2026");
    assert.equal(monthLabel("2026-01"), "January 2026");
    assert.equal(monthLabel("2026-12"), "December 2026");
  });

  it("names the Dubai month, not the UTC one it starts in", () => {
    // The first instant of August is 31 July in UTC. A label built without
    // the timezone said "July 2026" on August's invoice.
    assert.equal(monthLabel("2026-08"), "August 2026");
  });

  it("hands back anything it cannot read, rather than inventing a month", () => {
    assert.equal(monthLabel("banana"), "banana");
  });
});
