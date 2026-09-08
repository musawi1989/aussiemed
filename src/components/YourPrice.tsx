"use client";

import { formatAED } from "@/lib/money";

/**
 * What they pay, beside what everybody else pays.
 *
 * THE STRUCK-THROUGH PRICE IS THE ONE THEY WOULD OTHERWISE PAY AT THIS
 * QUANTITY — the volume break where one applies, not the single-unit price.
 * Striking through the higher number would show a bigger saving and would be
 * dishonest: the break is available to anybody who orders twelve.
 *
 * NO STRIKETHROUGH WHEN THERE IS NO SAVING. An agreed price beats volume
 * breaks outright, so an account on a rate agreed a year ago can now be paying
 * above a break added since. Inventing a saving there would be the worst kind
 * of lie — one the customer can check. The price is shown plainly instead.
 */
export function YourPrice({
  yours,
  list,
  suffix,
  size = "normal",
}: {
  /** What this account pays, in AED. */
  yours: number;
  /** What it would cost at this quantity without their agreement, in AED. */
  list: number;
  /** " per box", " excl. VAT" — whatever the surrounding line already says. */
  suffix?: string;
  size?: "normal" | "large";
}) {
  const saving = list - yours;
  // A fils either way is rounding, not a deal. Below that the strikethrough is
  // noise on a price that is effectively the same number twice.
  const better = saving >= 0.01;
  const percent = list > 0 ? Math.round((saving / list) * 100) : 0;

  const big = size === "large" ? "text-2xl" : "text-base";

  if (!better) {
    return (
      <span className={`font-bold tnum text-text ${big}`}>
        {formatAED(yours)}
        {suffix}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="tnum text-sm text-text-subtle line-through">
        {formatAED(list)}
      </span>
      <span className={`font-bold tnum text-navy ${big}`}>
        {formatAED(yours)}
        {suffix}
      </span>
      <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-success">
        your price
        {percent > 0 ? ` · save ${percent}%` : ""}
      </span>
    </span>
  );
}
