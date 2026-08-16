/**
 * The daily cutoff, as both sides of the business see it.
 *
 * Pure: no database, no imports. The buying run needs the last cutoff that has
 * passed; a buyer needs the next one that has not. Both are the same arithmetic
 * and they must agree exactly — a customer told they have twenty minutes left
 * and then missed the run would be a promise broken by a rounding difference.
 *
 * Everything is stored and compared in UTC. The hour is expressed in Asia/Dubai
 * because that is where the warehouse is and 5pm has to mean 5pm to the people
 * working it. The UAE has never observed daylight saving, so a fixed offset is
 * correct here and not a shortcut.
 */

export const DUBAI_OFFSET_HOURS = 4;

/** 5pm Asia/Dubai unless configured otherwise. */
export const DEFAULT_CUTOFF_HOUR = 17;

export const MIN_CUTOFF_HOUR = 0;
export const MAX_CUTOFF_HOUR = 23;

export function isValidCutoffHour(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_CUTOFF_HOUR &&
    value <= MAX_CUTOFF_HOUR
  );
}

/**
 * Parses what a form sends, refusing rather than falling back to a default.
 *
 * The blank check is not defensive tidiness. `Number("")` is 0, and 0 is a
 * valid hour, so an empty field would have set every buyer's deadline to
 * midnight without anyone being told — a plausible-looking wrong answer, which
 * is the worst kind.
 */
export function parseCutoffHour(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!/^\d{1,2}$/.test(text)) return null;

  const value = Number(text);
  return isValidCutoffHour(value) ? value : null;
}

/** The cutoff instant on the Dubai day that contains `now`. */
function cutoffOnSameDay(now: Date, hour: number): Date {
  const dubai = new Date(now.getTime() + DUBAI_OFFSET_HOURS * 3_600_000);
  return new Date(
    Date.UTC(
      dubai.getUTCFullYear(),
      dubai.getUTCMonth(),
      dubai.getUTCDate(),
      hour - DUBAI_OFFSET_HOURS,
      0,
      0,
      0
    )
  );
}

/**
 * The most recent cutoff that has passed.
 *
 * What the buying run pools against: everything ordered at or before this
 * instant is on the run.
 */
export function lastCutoffBefore(now: Date, cutoffHour: number): Date {
  const cutoff = cutoffOnSameDay(now, cutoffHour);
  // Before today's cutoff, the last one that passed was yesterday's.
  if (cutoff > now) cutoff.setUTCDate(cutoff.getUTCDate() - 1);
  return cutoff;
}

/**
 * The next cutoff that has not passed.
 *
 * What a buyer is racing. Exactly on the cutoff counts as made it — the run
 * pools everything at or before the instant, so the two must not disagree by
 * one millisecond about whether an order got in.
 */
export function nextCutoffAfter(now: Date, cutoffHour: number): Date {
  const cutoff = cutoffOnSameDay(now, cutoffHour);
  if (cutoff < now) cutoff.setUTCDate(cutoff.getUTCDate() + 1);
  return cutoff;
}

/* ------------------------------------------------------------------ *
 * What a buyer is told
 * ------------------------------------------------------------------ */

export type CutoffState = {
  /** When the next run closes, as an instant. */
  nextAt: Date;
  /** Milliseconds until it does. Never negative. */
  msRemaining: number;
  /** True when the next cutoff is later on the same Dubai day. */
  today: boolean;
  /** Under an hour to go — worth saying more loudly. */
  closingSoon: boolean;
  /** "5:00pm" — the hour as a buyer reads it. */
  label: string;
};

/** Under this, the message changes from informative to urgent. */
export const CLOSING_SOON_MS = 60 * 60_000;

export function cutoffState(now: Date, cutoffHour: number): CutoffState {
  const nextAt = nextCutoffAfter(now, cutoffHour);
  const msRemaining = Math.max(0, nextAt.getTime() - now.getTime());

  // Same Dubai day, compared in Dubai terms rather than UTC — around midnight
  // UTC the two disagree, and the buyer's day is the one that matters.
  const dubaiNow = new Date(now.getTime() + DUBAI_OFFSET_HOURS * 3_600_000);
  const dubaiCutoff = new Date(nextAt.getTime() + DUBAI_OFFSET_HOURS * 3_600_000);

  return {
    nextAt,
    msRemaining,
    today: dubaiNow.getUTCDate() === dubaiCutoff.getUTCDate(),
    closingSoon: msRemaining <= CLOSING_SOON_MS,
    label: formatCutoffHour(cutoffHour),
  };
}

/**
 * The hour as a buyer would say it: "5:00pm", "9:00am", "midnight", "noon".
 *
 * Twelve-hour with a suffix, because that is how the UAE reads a shop's
 * closing time, and named for the two hours where "12:00am" is routinely
 * misread as noon.
 */
export function formatCutoffHour(hour: number): string {
  if (!isValidCutoffHour(hour)) return formatCutoffHour(DEFAULT_CUTOFF_HOUR);
  if (hour === 0) return "midnight";
  if (hour === 12) return "noon";

  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12;
  return `${twelve}:00${suffix}`;
}

/**
 * How long is left, said the way somebody waiting would say it.
 *
 * Rounded down, never up. Telling a buyer "1 hour left" when fifty-nine
 * minutes remain is fine; telling them so when sixty-one seconds remain is a
 * promise the buying run will not keep.
 */
export function remainingLabel(ms: number): string {
  if (ms <= 0) return "closed";

  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "less than a minute";
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    const hourPart = `${hours} hour${hours === 1 ? "" : "s"}`;
    return minutes === 0
      ? hourPart
      : `${hourPart} ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}
