"use client";

import { useSearchParams } from "next/navigation";

/**
 * The one box, at the top of the sidebar.
 *
 * A plain GET form rather than a typeahead. It works before JavaScript has
 * loaded, it survives a back button, and the result is a URL somebody can send
 * to a colleague — none of which is true of a dropdown that disappears when
 * you look away. The cost is a page load, which on a back office is nothing.
 *
 * Opt-in, because the supplier portal shares this shell and has no business
 * searching across customers and orders.
 */
export function OpsSearch({ placeholder }: { placeholder: string }) {
  const params = useSearchParams();

  return (
    <form
      action="/admin/search"
      role="search"
      className="border-b border-border-base px-3 py-3"
    >
      <label className="sr-only" htmlFor="ops-search">
        Search the back office
      </label>
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          id="ops-search"
          type="search"
          name="q"
          // Prefilled on the results page so a near miss can be edited rather
          // than retyped.
          defaultValue={params.get("q") ?? ""}
          placeholder={placeholder}
          autoComplete="off"
          className="h-9 w-full rounded-card border border-border-strong bg-surface pl-8 pr-2 text-sm text-text placeholder:text-text-subtle focus:border-navy focus:outline-none"
        />
      </div>
    </form>
  );
}
