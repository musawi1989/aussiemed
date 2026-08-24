import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  barWidth,
  bucketByMonth,
  monthKey,
  monthLabel,
  share,
  topBy,
} from "./reporting.ts";

describe("monthKey", () => {
  it("buckets by the Dubai month, not the UTC one", () => {
    // 21:30 UTC on 31 January is 01:30 on 1 February in Dubai. Putting it in
    // January moves revenue between months for anyone reading a month-end
    // figure — and month-end is exactly when they read it.
    assert.equal(monthKey(new Date("2026-01-31T21:30:00Z")), "2026-02");
    assert.equal(monthKey(new Date("2026-01-31T19:00:00Z")), "2026-01");
  });

  it("handles a year boundary the same way", () => {
    assert.equal(monthKey(new Date("2025-12-31T21:00:00Z")), "2026-01");
  });

  it("accepts a timestamp as well as a date", () => {
    const at = Date.parse("2026-08-16T06:00:00Z");
    assert.equal(monthKey(at), "2026-08");
  });
});

describe("monthLabel", () => {
  it("reads as a person would say it", () => {
    assert.equal(monthLabel("2026-08"), "Aug 2026");
    assert.equal(monthLabel("2026-01"), "Jan 2026");
  });

  it("passes anything unrecognised straight through", () => {
    assert.equal(monthLabel("rubbish"), "rubbish");
  });
});

describe("bucketByMonth", () => {
  const now = new Date("2026-08-16T10:00:00Z");
  const orders = [
    { at: new Date("2026-08-02T08:00:00Z"), total: 10 },
    { at: new Date("2026-08-14T08:00:00Z"), total: 20 },
    { at: new Date("2026-06-05T08:00:00Z"), total: 30 },
  ];

  it("includes the months with nothing in them", () => {
    // A chart that skips July reads as though July did not happen, when what
    // it means is that July sold nothing.
    const buckets = bucketByMonth(orders, (o) => o.at, { months: 4, now });
    assert.deepEqual(
      buckets.map((b) => b.key),
      ["2026-05", "2026-06", "2026-07", "2026-08"],
    );
    assert.equal(buckets.find((b) => b.key === "2026-07")?.items.length, 0);
  });

  it("puts each item in its own month", () => {
    const buckets = bucketByMonth(orders, (o) => o.at, { months: 4, now });
    assert.equal(buckets.find((b) => b.key === "2026-08")?.items.length, 2);
    assert.equal(buckets.find((b) => b.key === "2026-06")?.items.length, 1);
  });

  it("drops anything older than the window rather than piling it on the end", () => {
    // Sweeping two years of history into the oldest bar makes that bar a lie.
    const withOld = [
      ...orders,
      { at: new Date("2024-01-01T00:00:00Z"), total: 999 },
    ];
    const buckets = bucketByMonth(withOld, (o) => o.at, { months: 4, now });
    const counted = buckets.reduce((n, b) => n + b.items.length, 0);
    assert.equal(counted, 3);
  });

  it("returns oldest first, which is how a chart reads", () => {
    const buckets = bucketByMonth(orders, (o) => o.at, { months: 3, now });
    assert.ok(buckets[0].key < buckets[buckets.length - 1].key);
  });

  it("copes with nothing at all", () => {
    const buckets = bucketByMonth([], (o: { at: Date }) => o.at, {
      months: 3,
      now,
    });
    assert.equal(buckets.length, 3);
    assert.ok(buckets.every((b) => b.items.length === 0));
  });
});

describe("share", () => {
  it("gives a percentage to one decimal", () => {
    assert.equal(share(25, 100), 25);
    assert.equal(share(1, 3), 33.3);
  });

  it("returns null rather than zero when nothing sold", () => {
    // A column of 0.0% reads as a measurement; it should read as an empty
    // period.
    assert.equal(share(0, 0), null);
    assert.equal(share(5, 0), null);
  });

  it("does not propagate nonsense", () => {
    assert.equal(share(Number.NaN, 100), null);
    assert.equal(share(1, Number.POSITIVE_INFINITY), null);
  });
});

describe("topBy", () => {
  const rows = [
    { name: "Bravo", value: 10 },
    { name: "Alpha", value: 10 },
    { name: "Charlie", value: 30 },
    { name: "Delta", value: 5 },
  ];

  it("takes the largest, with the tiebreak already applied", () => {
    // Charlie leads on value; Alpha and Bravo tie on 10 and are ordered by
    // name, so Alpha takes the second place.
    const top = topBy(
      rows,
      (r) => r.value,
      (r) => r.name,
      2,
    );
    assert.deepEqual(
      top.map((r) => r.name),
      ["Charlie", "Alpha"],
    );
  });

  it("breaks ties by name so the table is reproducible", () => {
    // Without this, two suppliers on identical figures swap places between
    // page loads, and a report nobody can quote is a report nobody uses.
    const top = topBy(
      rows,
      (r) => r.value,
      (r) => r.name,
      3,
    );
    assert.deepEqual(
      top.map((r) => r.name),
      ["Charlie", "Alpha", "Bravo"],
    );
  });

  it("does not mutate what it was given", () => {
    const before = rows.map((r) => r.name);
    topBy(
      rows,
      (r) => r.value,
      (r) => r.name,
      2,
    );
    assert.deepEqual(
      rows.map((r) => r.name),
      before,
    );
  });

  it("returns everything when asked for more than there is", () => {
    assert.equal(
      topBy(
        rows,
        (r) => r.value,
        (r) => r.name,
        99,
      ).length,
      4,
    );
  });
});

describe("barWidth", () => {
  it("scales against the largest, not the total", () => {
    // Against a total, every bar in a long tail is an invisible sliver.
    assert.equal(barWidth(50, 100), 50);
    assert.equal(barWidth(100, 100), 100);
  });

  it("keeps a real but tiny value visible", () => {
    assert.equal(barWidth(1, 100_000), 1);
  });

  it("draws no bar at all for nothing", () => {
    // A one-percent sliver where nothing happened reads as a small amount,
    // which is a different claim from none.
    assert.equal(barWidth(0, 100), 0);
    assert.equal(barWidth(-5, 100), 0);
    assert.equal(barWidth(10, 0), 0);
  });
});
