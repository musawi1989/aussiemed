"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { hrefWith, type FilterParams } from "@/lib/filter-href";

/**
 * A price window, in the currency the buyer is reading.
 *
 * Two boxes and an Apply rather than a slider: trade buyers arrive with a
 * budget in mind — "nothing over 200" — and a slider makes them hunt for a
 * number they already know. It also survives a keyboard and a phone, which a
 * two-handled slider does not.
 *
 * Whole dirhams. Every price on the site is ex-VAT, so the numbers here match
 * the ones on the cards rather than what the invoice will say.
 */
export function PriceFilter({
  min,
  max,
  params,
}: {
  min?: string;
  max?: string;
  /**
   * Everything else in force, so applying a price keeps the category and the
   * brand. Passed as data rather than as a ready-made link builder: a server
   * component may not hand a function to a client one, and both sides call the
   * same hrefWith instead.
   */
  params: FilterParams;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(min ?? "");
  const [to, setTo] = useState(max ?? "");

  const apply = () => {
    // Blank means "no end", not zero: a buyer clearing the box wants the limit
    // gone, and 0 would quietly filter everything out of a catalogue whose
    // cheapest line costs five dirhams.
    router.push(
      hrefWith(params, {
        minPrice: from.trim() === "" ? undefined : from.trim(),
        maxPrice: to.trim() === "" ? undefined : to.trim(),
      })
    );
  };

  const field =
    "h-9 w-full min-w-0 rounded-card border border-border-strong bg-surface px-2 text-sm text-text tnum placeholder:text-text-subtle focus:border-navy focus:outline-none";

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Lowest price in AED</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            placeholder="From"
            className={field}
          />
        </label>
        <span aria-hidden="true" className="text-xs text-text-subtle">
          &ndash;
        </span>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Highest price in AED</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            placeholder="To"
            className={field}
          />
        </label>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={apply}
          className="h-8 rounded-card bg-navy px-3 text-xs font-bold text-white transition-colors hover:bg-navy-hover"
        >
          Apply
        </button>
        {(min || max) && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
              router.push(hrefWith(params, { minPrice: undefined, maxPrice: undefined }));
            }}
            className="text-xs font-semibold text-brand hover:underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-text-subtle">AED, ex-VAT</span>
      </div>
    </div>
  );
}
