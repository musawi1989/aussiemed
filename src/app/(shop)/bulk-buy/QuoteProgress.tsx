"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";

/**
 * How far through the instructions the reader already is.
 *
 * A page of steps that cannot see the list it is describing is worse than
 * useless to somebody who has already built one: it tells them to start. This
 * reads the same store the header counter reads, so the page either says
 * "start here" or "you have four lines, go and send them".
 *
 * Renders nothing until the store has hydrated. A count that flashes zero and
 * then corrects itself reads as the list having been lost.
 */
export function QuoteProgress() {
  const { quoteLines, ready } = useStore();

  if (!ready) return null;

  if (quoteLines.length === 0) {
    return (
      <div className="rounded-panel border border-border-base bg-surface-sunken p-5">
        <p className="text-sm text-text-muted">
          Your bulk buy request is empty at the moment. Start with step one.
        </p>
        <Link
          href="/products"
          className="mt-3 inline-block rounded-card bg-navy px-5 py-2.5 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover"
        >
          Browse the full range
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-panel border border-navy bg-navy-soft p-5">
      <p className="text-sm font-bold text-navy">
        You have <span className="tnum">{quoteLines.length}</span>{" "}
        {quoteLines.length === 1 ? "line" : "lines"} on your bulk buy request.
      </p>
      <p className="mt-1 text-sm text-text-muted">
        Add more, or send what you have and we will come back with a price.
      </p>
      <Link
        href="/quote"
        className="mt-3 inline-block rounded-card bg-brand px-5 py-2.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover"
      >
        Review and send
      </Link>
    </div>
  );
}
