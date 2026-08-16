/**
 * Choosing a stretch of time to look at.
 *
 * Pure: no database, no imports. A buyer looking back over their spending
 * picks a period, and every figure and every download has to agree about
 * exactly which orders fall inside it — so the boundaries are decided once,
 * here, and tested.
 *
 * Boundaries are Dubai days. "This year" for a clinic in Dubai starts at
 * midnight their time, not at midnight UTC, and an order placed at 02:00 on
 * 1 January is theirs rather than last year's.
 */

const DUBAI_OFFSET_MS = 4 * 3_600_000;

export const PERIOD_KEYS = [
  "last12",
  "thisYear",
  "lastYear",
  "last3",
  "all",
  "custom",
] as const;

export type PeriodKey = (typeof PERIOD_KEYS)[number];

export type Period = {
  key: PeriodKey;
  label: string;
  /** Inclusive. Null for "everything", which has no start. */
  from: Date | null;
  /** Exclusive, so a range never double-counts a boundary order. */
  to: Date;
  /** How many months to draw, when the shape is a monthly chart. */
  months: number;
};

/** Midnight in Dubai, expressed as the UTC instant it happens at. */
function dubaiMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - DUBAI_OFFSET_MS);
}

/** The Dubai calendar parts of an instant. */
function dubaiParts(at: Date) {
  const shifted = new Date(at.getTime() + DUBAI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

export function isPeriodKey(value: unknown): value is PeriodKey {
  return (PERIOD_KEYS as readonly string[]).includes(String(value));
}

/**
 * A date as a form sends it, or nothing.
 *
 * Refuses anything that is not exactly a calendar date. Date.parse is far too
 * willing — it reads "2026" as a year and "March" as a month in some engines —
 * and a range that silently means something other than what was typed is worse
 * than one that refuses.
 */
export function parseDay(raw: unknown): { year: number; month: number; day: number } | null {
  const text = String(raw ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Rejects 31 February rather than rolling it into March.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;

  return { year, month: month - 1, day };
}

/**
 * Resolves the period a buyer asked for.
 *
 * Anything unrecognised falls back to the last twelve months rather than to
 * everything: a first view that loads five years of history is slower and
 * tells them less than one that loads the year they are actually thinking
 * about.
 */
export function resolvePeriod(
  input: { key?: unknown; from?: unknown; to?: unknown },
  now: Date = new Date()
): Period {
  const today = dubaiParts(now);
  // Exclusive end: tomorrow's midnight, so everything placed today counts.
  const endOfToday = dubaiMidnight(today.year, today.month, today.day + 1);

  const key = isPeriodKey(input.key) ? input.key : "last12";

  if (key === "custom") {
    const from = parseDay(input.from);
    const to = parseDay(input.to);

    if (from && to) {
      const start = dubaiMidnight(from.year, from.month, from.day);
      // The end day is inclusive to the reader, so the range runs to the
      // midnight after it. Somebody asking for 1–31 March means all of the
      // 31st, not up to the moment it began.
      const end = dubaiMidnight(to.year, to.month, to.day + 1);

      if (end > start) {
        return {
          key: "custom",
          label: `${format(start)} to ${formatInclusive(end)}`,
          from: start,
          to: end,
          months: monthsBetween(start, end),
        };
      }
    }
    // A half-filled or backwards range is not an error worth a red message on
    // a reporting screen; it is somebody mid-typing.
    return resolvePeriod({ key: "last12" }, now);
  }

  if (key === "all") {
    return {
      key,
      label: "Everything",
      from: null,
      to: endOfToday,
      months: 24,
    };
  }

  if (key === "thisYear") {
    const start = dubaiMidnight(today.year, 0, 1);
    return {
      key,
      label: String(today.year),
      from: start,
      to: endOfToday,
      months: today.month + 1,
    };
  }

  if (key === "lastYear") {
    return {
      key,
      label: String(today.year - 1),
      from: dubaiMidnight(today.year - 1, 0, 1),
      to: dubaiMidnight(today.year, 0, 1),
      months: 12,
    };
  }

  if (key === "last3") {
    return {
      key,
      label: "Last 3 months",
      from: dubaiMidnight(today.year, today.month - 2, 1),
      to: endOfToday,
      months: 3,
    };
  }

  return {
    key: "last12",
    label: "Last 12 months",
    from: dubaiMidnight(today.year, today.month - 11, 1),
    to: endOfToday,
    months: 12,
  };
}

/** Whole months a range spans, at least one. */
export function monthsBetween(from: Date, to: Date): number {
  const a = dubaiParts(from);
  const b = dubaiParts(new Date(to.getTime() - 1));
  return Math.max(1, (b.year - a.year) * 12 + (b.month - a.month) + 1);
}

const format = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);

/** The last day inside an exclusive end, which is what a reader means. */
const formatInclusive = (end: Date) => format(new Date(end.getTime() - 1));

/**
 * Whether an instant falls inside a period.
 *
 * The same comparison the database query uses, so a figure on the screen and
 * a row in a download can never disagree about one boundary order.
 */
export function withinPeriod(at: Date, period: Period): boolean {
  if (period.from && at < period.from) return false;
  return at < period.to;
}

/** Filename-safe, and readable a year later in a downloads folder. */
export function periodSlug(period: Period): string {
  if (period.key === "all") return "all-time";
  if (!period.from) return period.key;

  const iso = (d: Date) =>
    new Date(d.getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
  return `${iso(period.from)}-to-${iso(new Date(period.to.getTime() - 1))}`;
}
