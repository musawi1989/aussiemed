import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MIN_SAMPLE,
  currentStage,
  humanDuration,
  isLoggableSearch,
  normaliseSearch,
  onTimeRate,
  percentile,
  stages,
  summarise,
  timeBetween,
} from "./lifecycle.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.parse("2026-08-10T08:00:00Z");

const HISTORY = [
  { toStatus: "Sent", at: T0 },
  { toStatus: "Acknowledged", at: T0 + 3 * HOUR },
  { toStatus: "Dispatched", at: T0 + 2 * DAY },
];

describe("stages", () => {
  it("turns events into the periods between them", () => {
    const result = stages(HISTORY, T0 + 3 * DAY);
    assert.equal(result.length, 3);
    assert.equal(result[0].status, "Sent");
    assert.equal(result[0].ms, 3 * HOUR);
    assert.equal(result[1].status, "Acknowledged");
    assert.equal(result[1].ms, 2 * DAY - 3 * HOUR);
  });

  it("measures the last stage against now, because it has not ended", () => {
    const result = stages(HISTORY, T0 + 3 * DAY);
    assert.equal(result[2].leftAt, null);
    assert.equal(result[2].ms, DAY);
  });

  it("sorts before measuring, so out-of-order rows cannot go negative", () => {
    // A caller reading rows back from a database may sort by anything.
    const shuffled = [HISTORY[2], HISTORY[0], HISTORY[1]];
    const result = stages(shuffled, T0 + 3 * DAY);
    assert.deepEqual(
      result.map((s) => s.status),
      ["Sent", "Acknowledged", "Dispatched"]
    );
    assert.ok(result.every((s) => s.ms >= 0));
  });

  it("clamps at zero when two events share a millisecond", () => {
    const result = stages(
      [
        { toStatus: "Sent", at: T0 },
        { toStatus: "Acknowledged", at: T0 },
      ],
      T0
    );
    assert.equal(result[0].ms, 0);
  });

  it("copes with no history at all", () => {
    assert.deepEqual(stages([], T0), []);
    assert.equal(currentStage([], T0), null);
  });
});

describe("timeBetween", () => {
  it("measures from one status to another", () => {
    assert.equal(timeBetween(HISTORY, "Sent", "Acknowledged"), 3 * HOUR);
    assert.equal(timeBetween(HISTORY, "Sent", "Dispatched"), 2 * DAY);
  });

  it("returns null when either end never happened", () => {
    assert.equal(timeBetween(HISTORY, "Sent", "Received"), null);
    assert.equal(timeBetween(HISTORY, "Draft", "Sent"), null);
  });

  it("ignores an end that happened before the start", () => {
    const odd = [
      { toStatus: "Dispatched", at: T0 },
      { toStatus: "Sent", at: T0 + HOUR },
    ];
    assert.equal(timeBetween(odd, "Sent", "Dispatched"), null);
  });
});

describe("currentStage", () => {
  it("reports what it is in now and for how long", () => {
    const stage = currentStage(HISTORY, T0 + 3 * DAY);
    assert.equal(stage?.status, "Dispatched");
    assert.equal(stage?.ms, DAY);
  });
});

describe("percentile", () => {
  it("takes a real value rather than interpolating one", () => {
    // An interpolated answer is a duration nothing actually took, which is
    // hard to defend in a conversation with the supplier who took it.
    const values = [1, 2, 3, 4, 5];
    assert.equal(percentile(values, 0.5), 3);
    const p90 = percentile(values, 0.9);
    assert.ok(p90 !== null && values.includes(p90));
  });

  it("handles the ends without falling off the array", () => {
    const values = [10, 20, 30];
    assert.equal(percentile(values, 0), 10);
    assert.equal(percentile(values, 1), 30);
    assert.equal(percentile([], 0.5), null);
  });

  it("does not care what order it is given", () => {
    assert.equal(percentile([5, 1, 4, 2, 3], 0.5), 3);
  });
});

describe("summarise", () => {
  it("refuses to summarise a tiny sample", () => {
    // A confident number from three orders is worse than a blank, because it
    // gets acted on.
    const few = Array.from({ length: MIN_SAMPLE - 1 }, (_, i) => (i + 1) * HOUR);
    const result = summarise(few);
    assert.equal(result.enough, false);
    assert.equal(result.medianMs, null);
    assert.equal(result.p90Ms, null);
    // Still says how many, because "3 orders, not enough to say" is useful.
    assert.equal(result.count, MIN_SAMPLE - 1);
  });

  it("summarises once there is enough", () => {
    const values = [1, 2, 3, 4, 100].map((d) => d * HOUR);
    const result = summarise(values);
    assert.equal(result.enough, true);
    assert.equal(result.count, 5);
    assert.equal(result.medianMs, 3 * HOUR);
  });

  it("reports the median, which one outlier cannot drag", () => {
    // The mean here is 22 hours, which describes nobody's experience.
    const values = [1, 2, 3, 4, 100].map((d) => d * HOUR);
    assert.equal(summarise(values).medianMs, 3 * HOUR);
    assert.equal(summarise(values).p90Ms, 100 * HOUR);
  });

  it("drops nonsense rather than propagating it", () => {
    const result = summarise([HOUR, -5, Number.NaN, HOUR, HOUR, HOUR, HOUR]);
    assert.equal(result.count, 5);
    assert.equal(result.medianMs, HOUR);
  });
});

describe("onTimeRate", () => {
  const durations = [1, 2, 3, 4, 10].map((d) => d * DAY);

  it("says nothing when nothing was promised", () => {
    // An on-time rate against no agreed target is a number with no meaning.
    const result = onTimeRate(durations, null);
    assert.equal(result.rate, null);
    assert.equal(result.enough, false);
  });

  it("measures against the promise once there is enough", () => {
    const result = onTimeRate(durations, 4 * DAY);
    assert.equal(result.rate, 80);
    assert.equal(result.enough, true);
  });

  it("counts exactly on time as on time", () => {
    assert.equal(onTimeRate([DAY, DAY, DAY, DAY, DAY], DAY).rate, 100);
  });

  it("refuses a rate from a tiny sample even with a promise", () => {
    assert.equal(onTimeRate([DAY, DAY], DAY).rate, null);
  });
});

describe("humanDuration", () => {
  it("uses the units a person would say", () => {
    assert.equal(humanDuration(30_000), "under a minute");
    assert.equal(humanDuration(5 * 60_000), "5 minutes");
    assert.equal(humanDuration(60_000), "1 minute");
    assert.equal(humanDuration(3 * HOUR), "3 hours");
    assert.equal(humanDuration(HOUR), "1 hour");
    assert.equal(humanDuration(2 * DAY), "2 days");
    assert.equal(humanDuration(DAY), "1 day");
  });

  it("shows a dash rather than inventing a figure", () => {
    assert.equal(humanDuration(null), "—");
    assert.equal(humanDuration(Number.NaN), "—");
  });
});

describe("searches", () => {
  it("groups spellings that differ only in case and spacing", () => {
    assert.equal(normaliseSearch("  Nitrile   Gloves "), "nitrile gloves");
    assert.equal(normaliseSearch("NITRILE GLOVES"), "nitrile gloves");
  });

  it("keeps singular and plural apart on purpose", () => {
    // Two people typing "glove" and "gloves" and finding nothing are two
    // pieces of evidence about wording, and flattening them loses it.
    assert.notEqual(normaliseSearch("glove"), normaliseSearch("gloves"));
  });

  it("ignores a keystroke and a paste accident", () => {
    assert.equal(isLoggableSearch("g"), false);
    assert.equal(isLoggableSearch(" "), false);
    assert.equal(isLoggableSearch("gl"), true);
    assert.equal(isLoggableSearch("x".repeat(121)), false);
    assert.equal(isLoggableSearch("x".repeat(120)), true);
  });
});
