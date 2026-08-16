import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLOSING_SOON_MS,
  DEFAULT_CUTOFF_HOUR,
  cutoffState,
  formatCutoffHour,
  isValidCutoffHour,
  lastCutoffBefore,
  nextCutoffAfter,
  parseCutoffHour,
  remainingLabel,
} from "./cutoff.ts";

/** 14:00 Dubai on 16 Aug 2026, which is 10:00 UTC. */
const AFTERNOON = new Date("2026-08-16T10:00:00Z");
/** 18:00 Dubai the same day — after a 5pm cutoff. */
const EVENING = new Date("2026-08-16T14:00:00Z");

describe("valid hours", () => {
  it("accepts every hour of the day and nothing else", () => {
    for (let h = 0; h <= 23; h++) assert.equal(isValidCutoffHour(h), true, String(h));
    for (const bad of [-1, 24, 17.5, "17", null, undefined, Number.NaN]) {
      assert.equal(isValidCutoffHour(bad), false, String(bad));
    }
  });

  it("parses a form value, or refuses rather than defaulting quietly", () => {
    assert.equal(parseCutoffHour("17"), 17);
    assert.equal(parseCutoffHour(" 0 "), 0);
    assert.equal(parseCutoffHour("24"), null);
    assert.equal(parseCutoffHour("half five"), null);
    assert.equal(parseCutoffHour(""), null);
    // Silently falling back to 5pm would move every buyer's deadline without
    // anyone being told.
    assert.notEqual(parseCutoffHour("nonsense"), DEFAULT_CUTOFF_HOUR);
  });
});

describe("lastCutoffBefore", () => {
  it("uses today's cutoff once it has passed", () => {
    // 18:00 Dubai, 5pm cutoff -> today at 17:00 Dubai, which is 13:00 UTC.
    assert.equal(
      lastCutoffBefore(EVENING, 17).toISOString(),
      "2026-08-16T13:00:00.000Z"
    );
  });

  it("uses yesterday's cutoff before today's has passed", () => {
    assert.equal(
      lastCutoffBefore(AFTERNOON, 17).toISOString(),
      "2026-08-15T13:00:00.000Z"
    );
  });
});

describe("nextCutoffAfter", () => {
  it("is later today when the cutoff has not passed", () => {
    assert.equal(
      nextCutoffAfter(AFTERNOON, 17).toISOString(),
      "2026-08-16T13:00:00.000Z"
    );
  });

  it("rolls to tomorrow once it has", () => {
    assert.equal(
      nextCutoffAfter(EVENING, 17).toISOString(),
      "2026-08-17T13:00:00.000Z"
    );
  });

  it("agrees with lastCutoffBefore — they must never disagree", () => {
    // A buyer told they have twenty minutes and then missed the run would be
    // a promise broken by a rounding difference between these two.
    for (const hour of [0, 6, 12, 17, 23]) {
      for (const at of ["T00:30:00Z", "T09:00:00Z", "T13:00:00Z", "T19:45:00Z"]) {
        const now = new Date(`2026-08-16${at}`);
        const last = lastCutoffBefore(now, hour);
        const next = nextCutoffAfter(now, hour);
        assert.ok(last <= now, `last ${last.toISOString()} > now at hour ${hour}`);
        assert.ok(next >= now, `next ${next.toISOString()} < now at hour ${hour}`);

        // A day apart everywhere except standing exactly on the cutoff, where
        // both correctly name that same instant: it is the last one that has
        // passed and the next one that has not.
        const gap = next.getTime() - last.getTime();
        assert.ok(
          gap === 86_400_000 || (gap === 0 && next.getTime() === now.getTime()),
          `gap ${gap} at hour ${hour}, ${at}`
        );
      }
    }
  });

  it("errs toward telling a buyer they have missed it, never the reverse", () => {
    // Standing exactly on the cutoff, the buyer is shown nothing remaining
    // while the run would in fact still take their order. That is the safe
    // direction: there is no instant where they are told they have time and
    // then find they did not.
    const exactly = new Date("2026-08-16T13:00:00Z");
    assert.equal(cutoffState(exactly, 17).msRemaining, 0);
    assert.ok(lastCutoffBefore(exactly, 17).getTime() === exactly.getTime());

    const aMomentLater = new Date(exactly.getTime() + 1);
    assert.ok(cutoffState(aMomentLater, 17).msRemaining > 0);
    assert.equal(cutoffState(aMomentLater, 17).today, false);
  });

  it("treats the exact instant as still in time", () => {
    // The run pools everything at or before the cutoff, so a buyer landing on
    // the millisecond has made it.
    const exactly = new Date("2026-08-16T13:00:00Z");
    assert.equal(nextCutoffAfter(exactly, 17).getTime(), exactly.getTime());
    assert.equal(cutoffState(exactly, 17).msRemaining, 0);
  });
});

describe("cutoffState", () => {
  it("counts down to today's cutoff", () => {
    const state = cutoffState(AFTERNOON, 17);
    assert.equal(state.today, true);
    assert.equal(state.msRemaining, 3 * 3_600_000);
    assert.equal(state.closingSoon, false);
    assert.equal(state.label, "5:00pm");
  });

  it("says tomorrow once today's has gone", () => {
    const state = cutoffState(EVENING, 17);
    assert.equal(state.today, false);
    assert.equal(state.msRemaining, 23 * 3_600_000);
  });

  it("flags the last hour", () => {
    const nearly = new Date("2026-08-16T12:30:00Z"); // 16:30 Dubai
    assert.equal(cutoffState(nearly, 17).closingSoon, true);
    assert.equal(cutoffState(nearly, 17).msRemaining, 30 * 60_000);
  });

  it("works out today against the Dubai day, not the UTC one", () => {
    // 22:00 UTC on the 16th is 02:00 Dubai on the 17th. The buyer's day has
    // already rolled over, so a 5pm cutoff is later *today* for them even
    // though UTC still says the 16th.
    const lateUtc = new Date("2026-08-16T22:00:00Z");
    const state = cutoffState(lateUtc, 17);
    assert.equal(state.today, true);
    assert.equal(state.nextAt.toISOString(), "2026-08-17T13:00:00.000Z");
  });

  it("never counts below zero", () => {
    assert.ok(cutoffState(new Date("2026-08-16T13:00:00Z"), 17).msRemaining >= 0);
  });
});

describe("formatCutoffHour", () => {
  it("reads the way a buyer would say it", () => {
    assert.equal(formatCutoffHour(17), "5:00pm");
    assert.equal(formatCutoffHour(9), "9:00am");
    assert.equal(formatCutoffHour(13), "1:00pm");
    assert.equal(formatCutoffHour(23), "11:00pm");
    assert.equal(formatCutoffHour(1), "1:00am");
  });

  it("names the two hours people misread", () => {
    // "12:00am" is routinely read as noon.
    assert.equal(formatCutoffHour(0), "midnight");
    assert.equal(formatCutoffHour(12), "noon");
  });

  it("falls back to the default rather than printing nonsense", () => {
    assert.equal(formatCutoffHour(99), formatCutoffHour(DEFAULT_CUTOFF_HOUR));
  });
});

describe("remainingLabel", () => {
  it("rounds down, never up", () => {
    // "1 hour left" with sixty-one seconds to go is a promise the buying run
    // will not keep.
    assert.equal(remainingLabel(61_000), "1 minute");
    assert.equal(remainingLabel(119_000), "1 minute");
    assert.equal(remainingLabel(3_599_000), "59 minutes");
  });

  it("says hours and minutes together once past an hour", () => {
    assert.equal(remainingLabel(3_600_000), "1 hour");
    assert.equal(remainingLabel(3_600_000 + 60_000), "1 hour 1 minute");
    assert.equal(remainingLabel(2 * 3_600_000 + 30 * 60_000), "2 hours 30 minutes");
  });

  it("handles the ends", () => {
    assert.equal(remainingLabel(0), "closed");
    assert.equal(remainingLabel(-1), "closed");
    assert.equal(remainingLabel(30_000), "less than a minute");
    assert.equal(remainingLabel(25 * 3_600_000), "1 day");
  });

  it("agrees with the closing-soon threshold", () => {
    assert.equal(remainingLabel(CLOSING_SOON_MS), "1 hour");
  });
});
