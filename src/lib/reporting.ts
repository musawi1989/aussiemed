/**
 * Shaping figures into a report.
 *
 * Pure: no database, no imports. Bucketing, ranking and share-of-total are the
 * parts of a report that quietly go wrong — a month boundary read in the wrong
 * timezone moves revenue between months, a share that divides by zero renders
 * NaN, and a "top ten" that breaks ties by whatever order the database
 * happened to return is not reproducible. All three are testable without a
 * database, so they are here.
 *
 * Durations and their medians live in lifecycle.ts, which this deliberately
 * does not duplicate.
 */

/** UTC+4, no daylight saving. A month here is a Dubai month. */
const DUBAI_OFFSET_MS = 4 * 3_600_000;

/**
 * The month a moment falls in, for the people reading the report.
 *
 * An order placed at 21:30 UTC on 31 January is 01:30 on 1 February in Dubai.
 * Bucketing it into January would move revenue between months for anyone
 * looking at a month-end figure, and month-end is exactly when they look.
 */
export function monthKey(at: Date | number): string {
  const dubai = new Date(
    (typeof at === "number" ? at : at.getTime()) + DUBAI_OFFSET_MS,
  );
  const year = dubai.getUTCFullYear();
  const month = String(dubai.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** "2026-08" as a person would read it. */
export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${names[month - 1]} ${year}`;
}

export type MonthBucket<T> = {
  key: string;
  label: string;
  items: T[];
};

/**
 * Groups by month, including the months with nothing in them.
 *
 * The empty months are the point. A chart that silently skips March reads as
 * though March did not happen, when what it means is that March sold nothing —
 * and those are very different pieces of news.
 */
export function bucketByMonth<T>(
  items: T[],
  at: (item: T) => Date | number,
  options: { months: number; now?: Date },
): MonthBucket<T>[] {
  const now = options.now ?? new Date();
  const buckets = new Map<string, T[]>();

  // Seed every month in the window so gaps are visible rather than absent.
  const cursor = new Date(now.getTime() + DUBAI_OFFSET_MS);
  cursor.setUTCDate(1);
  for (let i = 0; i < options.months; i++) {
    const year = cursor.getUTCFullYear();
    const month = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    buckets.set(`${year}-${month}`, []);
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }

  for (const item of items) {
    const key = monthKey(at(item));
    const bucket = buckets.get(key);
    // Anything older than the window is dropped rather than piled into the
    // oldest month, which would make one bar meaningless.
    if (bucket) bucket.push(item);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, list]) => ({ key, label: monthLabel(key), items: list }));
}

/**
 * A share of a total, as a percentage to one decimal.
 *
 * Null rather than zero when the total is zero: nothing sold is not the same
 * as this line being 0% of what sold, and a table of 0.0% down a column reads
 * as a measurement rather than as an empty period.
 */
export function share(part: number, total: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total === 0) {
    return null;
  }
  return Math.round((part / total) * 1000) / 10;
}

/**
 * The largest n, with ties broken by name so the same data always produces
 * the same table.
 *
 * Without the tiebreak, two suppliers on identical figures would swap places
 * between page loads, which makes a report impossible to talk about.
 */
export function topBy<T>(
  items: T[],
  value: (item: T) => number,
  name: (item: T) => string,
  n: number,
): T[] {
  return [...items]
    .sort((a, b) => {
      const diff = value(b) - value(a);
      if (diff !== 0) return diff;
      return name(a).localeCompare(name(b));
    })
    .slice(0, n);
}

/**
 * Scales a value to a bar width, against the largest in the set.
 *
 * Relative to the biggest rather than to the total, because the question a bar
 * chart answers is "how does this compare with the others", and against a
 * total every bar in a long tail is an invisible sliver.
 */
export function barWidth(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  if (value <= 0) return 0;

  // A floor for everything above zero, so a real but tiny value stays visible
  // as something. Zero itself gets no bar: a sliver where nothing happened
  // reads as a small amount, which is a different claim.
  return Math.max(1, Math.round((value / max) * 100));
}
