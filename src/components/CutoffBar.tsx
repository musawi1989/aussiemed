"use client";

import { useEffect, useState } from "react";
import { CLOSING_SOON_MS, remainingLabel } from "@/lib/cutoff";

/**
 * The deadline, on every page of the storefront.
 *
 * A buyer's real question is not "what time is the cutoff" but "have I still
 * got time", and those are different sentences. The server renders the first
 * one, which is true whenever the page is built and safe to cache; the
 * countdown appears after mount and ticks, because only the browser knows what
 * time it is for the person reading.
 *
 * That split is also why there is no hydration mismatch: the server never
 * renders a number that the client would immediately disagree with.
 *
 * It rounds down and never up. Telling someone they have an hour when they
 * have sixty-one seconds is a promise the buying run will not keep.
 */
export function CutoffBar({
  cutoffAtMs,
  label,
  today,
}: {
  /** The instant the next run closes, from the server. */
  cutoffAtMs: number;
  /** "5:00pm" — the hour as the buyer reads it. */
  label: string;
  /** Whether that instant is later on the buyer's own day. */
  today: boolean;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, cutoffAtMs - Date.now()));
    tick();

    // Every fifteen seconds: the label is in whole minutes, so a second-by-
    // second timer would redraw the same text fourteen times out of fifteen.
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, [cutoffAtMs]);

  const closingSoon = remaining !== null && remaining <= CLOSING_SOON_MS;
  /**
   * The tab was open when the deadline passed.
   *
   * The server said "today" because it was true when the page was built, and
   * a stale promise is worse than no promise — so once the clock runs out the
   * component corrects its own wording rather than waiting for a refresh that
   * may never come.
   */
  const passed = remaining !== null && remaining <= 0;

  return (
    <div
      className={`border-b transition-colors ${
        closingSoon
          ? "border-accent-border bg-accent-soft"
          : "border-border-base bg-surface-sunken"
      }`}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-4 py-2 text-center text-sm">
        {passed ? (
          <>
            <span className="font-bold text-text">
              Today&rsquo;s {label} run has closed
            </span>
            <span className="text-text-muted">
              — order now for the next dispatch
            </span>
          </>
        ) : (
          <>
            <span className="font-bold text-text">
              Order before {label} {today ? "today" : "tomorrow"}
            </span>
            <span className="text-text-muted">
              for the next dispatch
            </span>

            {/* Only once the browser has told us the time. Until then the
                sentence above stands on its own and is still true. */}
            {remaining !== null && (
              <span
                className={`tnum font-bold ${
                  closingSoon ? "text-accent" : "text-navy"
                }`}
                aria-live="polite"
              >
                &middot; {remainingLabel(remaining)} left
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
