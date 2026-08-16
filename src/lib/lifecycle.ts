/**
 * Turning a list of state changes into the questions people actually ask.
 *
 * Pure: no database, no imports. Everything takes plain timestamps in
 * milliseconds and returns durations in milliseconds, so the same functions
 * answer "how long did this supplier take to acknowledge" and "how long has
 * this pack been out of stock" without either caring where the rows came from.
 *
 * Two rules run through all of it, and both come from the platform's own
 * conventions rather than from arithmetic:
 *
 *  - Report the median and the 90th percentile, not the average. One supplier
 *    who took three weeks over Eid moves a mean and tells you nothing about
 *    the ordinary case; the median tells you the ordinary case and the P90
 *    tells you the bad one.
 *  - Say "not enough data" rather than deriving a percentage from three
 *    orders. A confident number from a tiny sample is worse than a blank,
 *    because it gets acted on.
 */

/** Below this, a percentage or an average is a story about noise. */
export const MIN_SAMPLE = 5;

export type Event = {
  toStatus: string;
  fromStatus?: string | null;
  at: number;
};

/* ------------------------------------------------------------------ *
 * One thing's history
 * ------------------------------------------------------------------ */

export type Stage = {
  status: string;
  enteredAt: number;
  /** Null while it is still in this state. */
  leftAt: number | null;
  /** How long it stayed, or how long it has been so far. */
  ms: number;
};

/**
 * The stages one order, purchase order or pack has been through.
 *
 * Events are sorted here rather than trusted to arrive in order: they are read
 * back from a database by a caller that might sort by anything, and a history
 * that silently reorders itself would produce negative durations.
 */
export function stages(events: Event[], now: number): Stage[] {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const out: Stage[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];
    const next = sorted[i + 1];
    const leftAt = next ? next.at : null;

    out.push({
      status: event.toStatus,
      enteredAt: event.at,
      leftAt,
      // Clamped at zero: two events recorded in the same millisecond, or a
      // clock that stepped backwards, must not produce a negative duration.
      ms: Math.max(0, (leftAt ?? now) - event.at),
    });
  }

  return out;
}

/** How long between first reaching one status and first reaching another. */
export function timeBetween(
  events: Event[],
  from: string,
  to: string
): number | null {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const start = sorted.find((e) => e.toStatus === from);
  if (!start) return null;

  const end = sorted.find((e) => e.toStatus === to && e.at >= start.at);
  if (!end) return null;

  return Math.max(0, end.at - start.at);
}

/** What state it is in now, and since when. */
export function currentStage(events: Event[], now: number): Stage | null {
  const all = stages(events, now);
  return all.length > 0 ? all[all.length - 1] : null;
}

/* ------------------------------------------------------------------ *
 * Many things, summarised
 * ------------------------------------------------------------------ */

export type Summary = {
  count: number;
  medianMs: number | null;
  p90Ms: number | null;
  /** False when there is too little to say anything honest. */
  enough: boolean;
};

/**
 * The nearest-rank percentile, not an interpolated one.
 *
 * Interpolating invents a duration that nothing actually took. For "how long
 * does this supplier usually take", an answer that is one of the real answers
 * is easier to defend in a conversation with that supplier.
 */
export function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export function summarise(durations: number[]): Summary {
  const values = durations.filter((v) => Number.isFinite(v) && v >= 0);

  if (values.length < MIN_SAMPLE) {
    // The count is still reported. "3 orders, not enough to say" is a useful
    // sentence; a blank with no explanation is not.
    return { count: values.length, medianMs: null, p90Ms: null, enough: false };
  }

  return {
    count: values.length,
    medianMs: percentile(values, 0.5),
    p90Ms: percentile(values, 0.9),
    enough: true,
  };
}

/**
 * Whether a promise was kept, given the promise.
 *
 * Null when nothing was promised — an on-time rate against no agreed target
 * is a number with no meaning, and BE-33 exists because those targets are a
 * business input somebody has to collect.
 */
export function onTimeRate(
  durationsMs: number[],
  promisedMs: number | null
): { rate: number | null; count: number; enough: boolean } {
  if (promisedMs === null || !Number.isFinite(promisedMs)) {
    return { rate: null, count: durationsMs.length, enough: false };
  }

  const values = durationsMs.filter((v) => Number.isFinite(v) && v >= 0);
  if (values.length < MIN_SAMPLE) {
    return { rate: null, count: values.length, enough: false };
  }

  const onTime = values.filter((v) => v <= promisedMs).length;
  return {
    rate: Math.round((onTime / values.length) * 1000) / 10,
    count: values.length,
    enough: true,
  };
}

/* ------------------------------------------------------------------ *
 * Saying a duration out loud
 * ------------------------------------------------------------------ */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A duration in the units a person would use.
 *
 * Deliberately coarse. "2 days" is what someone says about a delivery; "2 days
 * 3 hours 14 minutes" is a stopwatch reading, and the extra precision is
 * noise on a figure that varies by hours anyway.
 */
export function humanDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms < MINUTE) return "under a minute";

  if (ms < HOUR) {
    const minutes = Math.round(ms / MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  if (ms < DAY) {
    const hours = Math.round(ms / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  const days = Math.round(ms / DAY);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------ *
 * Searches
 * ------------------------------------------------------------------ */

/**
 * The form a search is grouped by.
 *
 * Lower case and single-spaced so "Nitrile  Gloves" and "nitrile gloves" are
 * one row in a report. Deliberately not stemmed or de-pluralised: "glove" and
 * "gloves" finding nothing are two different pieces of evidence about what
 * somebody typed, and flattening them loses the wording.
 */
export function normaliseSearch(term: string): string {
  return term.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Whether a search is worth recording at all.
 *
 * A single character is a keystroke, not a question, and a very long string is
 * a paste accident. Neither belongs in a list that is meant to say what to
 * stock next.
 */
export function isLoggableSearch(term: string): boolean {
  const clean = normaliseSearch(term);
  return clean.length >= 2 && clean.length <= 120;
}
