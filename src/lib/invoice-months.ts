/**
 * Which calendar month a receipt belongs to.
 *
 * Pure, and separate from supplier-invoices.ts for the usual reason: that file
 * is server-only and imports the database, so nothing in it can be reached by a
 * test. This is the part where an off-by-one silently misbills a month, so it
 * is the part that has to be testable.
 *
 * A MONTH IS A DUBAI MONTH, not a UTC one. Timestamps are stored UTC and shown
 * in Asia/Dubai, the platform's convention everywhere else, and a month has to
 * follow the same rule: a delivery booked in at 02:00 Dubai on the 1st is
 * 22:00 UTC on the last of the previous month, and billing it to the month
 * before the warehouse says it arrived is an argument waiting to happen. The
 * first version of this used UTC and put "01 Aug 2026" on the end of July's
 * invoice, which is how it was noticed.
 *
 * A FIXED OFFSET IS SAFE HERE, and only here. The UAE has not observed
 * daylight saving, so Asia/Dubai is UTC+4 year round — the same assumption
 * CutoffForm states out loud. Do not copy this into anything that has to work
 * for another country.
 */

const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;

/** "2026-08" for the month a date falls in, read as a Dubai date. */
export function monthKey(date: Date): string {
  const local = new Date(date.getTime() + DUBAI_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The first instant of a month, and the first instant of the NEXT, both UTC.
 *
 * A half-open range, compared with `>= from` and `< to`, so every instant
 * belongs to exactly one month. An end-of-month timestamp would drop whatever
 * arrived in the last second of the 31st — and only in months that have one.
 */
export function monthRange(month: string): { from: Date; to: Date } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;

  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  if (index < 0 || index > 11) return null;

  // Midnight Dubai, expressed as the UTC instant the database stores.
  // Date.UTC rolls December into the next January on its own, so there is no
  // year-end special case to get wrong.
  return {
    from: new Date(Date.UTC(year, index, 1) - DUBAI_OFFSET_MS),
    to: new Date(Date.UTC(year, index + 1, 1) - DUBAI_OFFSET_MS),
  };
}

/** "August 2026", for a heading rather than a key. */
export function monthLabel(month: string): string {
  const range = monthRange(month);
  if (!range) return month;
  // Read back in Dubai, or the first instant of the month — which is the last
  // evening of the previous one in UTC — would name the wrong month.
  return range.from.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Dubai",
  });
}
