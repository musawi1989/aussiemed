import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPeriodKey,
  monthsBetween,
  parseDay,
  periodSlug,
  resolvePeriod,
  withinPeriod,
} from "./periods.ts";

/** 16 Aug 2026, 10:00 UTC — 14:00 in Dubai. */
const NOW = new Date("2026-08-16T10:00:00Z");

describe("parseDay", () => {
  it("accepts a calendar date and nothing else", () => {
    assert.deepEqual(parseDay("2026-08-16"), { year: 2026, month: 7, day: 16 });
    for (const bad of ["2026", "March", "16/08/2026", "2026-8-16", "", null, "2026-13-01"]) {
      assert.equal(parseDay(bad), null, String(bad));
    }
  });

  it("rejects a day that does not exist rather than rolling it forward", () => {
    // Date.parse would happily read this as 3 March.
    assert.equal(parseDay("2026-02-31"), null);
    assert.deepEqual(parseDay("2026-02-28"), { year: 2026, month: 1, day: 28 });
  });
});

describe("resolvePeriod", () => {
  it("defaults to the last twelve months", () => {
    const period = resolvePeriod({}, NOW);
    assert.equal(period.key, "last12");
    assert.equal(period.months, 12);
    // Starts at the beginning of the month eleven months back.
    assert.equal(period.from?.toISOString(), "2025-08-31T20:00:00.000Z");
  });

  it("falls back to twelve months rather than to everything", () => {
    // A first view that loads five years is slower and says less than one
    // showing the year somebody is actually thinking about.
    assert.equal(resolvePeriod({ key: "nonsense" }, NOW).key, "last12");
  });

  it("starts the year at midnight in Dubai, not in UTC", () => {
    // An order placed at 02:00 on 1 January is theirs, not last year's.
    const period = resolvePeriod({ key: "thisYear" }, NOW);
    assert.equal(period.from?.toISOString(), "2025-12-31T20:00:00.000Z");
    assert.equal(period.label, "2026");
  });

  it("closes last year exactly where this year opens", () => {
    const last = resolvePeriod({ key: "lastYear" }, NOW);
    const current = resolvePeriod({ key: "thisYear" }, NOW);
    // No gap and no overlap, so no order is counted twice or missed.
    assert.equal(last.to.getTime(), current.from?.getTime());
    assert.equal(last.label, "2025");
  });

  it("includes everything placed today", () => {
    const period = resolvePeriod({ key: "thisYear" }, NOW);
    const laterToday = new Date("2026-08-16T19:30:00Z");
    assert.equal(withinPeriod(laterToday, period), true);
  });

  it("has no start when asked for everything", () => {
    const period = resolvePeriod({ key: "all" }, NOW);
    assert.equal(period.from, null);
    assert.equal(withinPeriod(new Date("2019-01-01T00:00:00Z"), period), true);
  });

  describe("a custom range", () => {
    const custom = resolvePeriod(
      { key: "custom", from: "2026-03-01", to: "2026-03-31" },
      NOW
    );

    it("runs to the end of the last day, not to its beginning", () => {
      // Somebody asking for 1 to 31 March means all of the 31st.
      assert.equal(withinPeriod(new Date("2026-03-31T19:00:00Z"), custom), true);
      assert.equal(withinPeriod(new Date("2026-03-31T20:30:00Z"), custom), false);
    });

    it("excludes the day before it starts", () => {
      assert.equal(withinPeriod(new Date("2026-02-28T19:00:00Z"), custom), false);
      assert.equal(withinPeriod(new Date("2026-02-28T20:30:00Z"), custom), true);
    });

    it("reads back as the dates that were typed", () => {
      assert.equal(custom.label, "01 Mar 2026 to 31 Mar 2026");
    });

    it("quietly falls back while somebody is still typing", () => {
      // Half a range is not an error worth a red message on a report.
      assert.equal(resolvePeriod({ key: "custom", from: "2026-03-01" }, NOW).key, "last12");
      assert.equal(
        resolvePeriod({ key: "custom", from: "2026-03-31", to: "2026-03-01" }, NOW).key,
        "last12"
      );
    });

    it("allows a single day", () => {
      const oneDay = resolvePeriod(
        { key: "custom", from: "2026-03-05", to: "2026-03-05" },
        NOW
      );
      assert.equal(oneDay.key, "custom");
      assert.equal(oneDay.months, 1);
      assert.equal(withinPeriod(new Date("2026-03-05T08:00:00Z"), oneDay), true);
      assert.equal(withinPeriod(new Date("2026-03-06T08:00:00Z"), oneDay), false);
    });
  });
});

describe("monthsBetween", () => {
  it("counts the months a range touches", () => {
    const march = resolvePeriod({ key: "custom", from: "2026-03-01", to: "2026-03-31" }, NOW);
    assert.equal(march.months, 1);

    const quarter = resolvePeriod({ key: "custom", from: "2026-01-01", to: "2026-03-31" }, NOW);
    assert.equal(quarter.months, 3);
  });

  it("never returns zero, so a chart always has a bar", () => {
    const oneDay = resolvePeriod({ key: "custom", from: "2026-03-05", to: "2026-03-05" }, NOW);
    assert.ok(oneDay.months >= 1);
    assert.equal(monthsBetween(new Date(), new Date()), 1);
  });
});

describe("withinPeriod", () => {
  it("agrees with the boundaries the period declares", () => {
    // The screen and the download must never disagree about one boundary
    // order, so both ask this.
    const period = resolvePeriod({ key: "lastYear" }, NOW);
    assert.equal(withinPeriod(period.from!, period), true);
    assert.equal(withinPeriod(new Date(period.to.getTime() - 1), period), true);
    assert.equal(withinPeriod(period.to, period), false);
  });
});

describe("periodSlug", () => {
  it("is readable in a downloads folder a year later", () => {
    assert.equal(
      periodSlug(resolvePeriod({ key: "custom", from: "2026-03-01", to: "2026-03-31" }, NOW)),
      "2026-03-01-to-2026-03-31"
    );
    assert.equal(periodSlug(resolvePeriod({ key: "all" }, NOW)), "all-time");
  });

  it("carries no characters a filesystem would refuse", () => {
    for (const key of ["last12", "thisYear", "lastYear", "last3", "all"] as const) {
      const slug = periodSlug(resolvePeriod({ key }, NOW));
      assert.ok(/^[a-zA-Z0-9._-]+$/.test(slug), `${key} -> ${slug}`);
    }
  });
});

describe("isPeriodKey", () => {
  it("recognises what it offers, and nothing else", () => {
    assert.equal(isPeriodKey("thisYear"), true);
    assert.equal(isPeriodKey("whenever"), false);
  });
});
