"use client";

import { useRouter } from "next/navigation";

/**
 * Filters that live in the URL.
 *
 * Called AdminFilters until 23 Aug 2026, when the customer's own order list
 * grew the same set. Nothing about it was ever admin-only — it is a form that
 * writes its state into the address bar — and a component named for the first
 * screen that happened to use it is a component nobody reuses.
 *
 * A GET form would do this on its own, but it would also carry every empty
 * select along as `?status=&supplier=`, which makes a shared link unreadable
 * and a bookmark misleading. So the form is intercepted, empty values are
 * dropped, and paging resets — changing a filter while on page 4 of the old
 * result set is never what anyone meant.
 */
export function UrlFilters({
  basePath,
  searchName,
  searchValue,
  searchPlaceholder,
  selects = [],
  autoApply = false,
  clearLabel = "Clear",
  carry = {},
}: {
  basePath: string;
  searchName?: string;
  searchValue?: string;
  searchPlaceholder?: string;
  selects?: {
    name: string;
    label: string;
    value: string;
    options: { value: string; label: string }[];
    /**
     * What the empty option at the top reads.
     *
     * Defaults to the label, which is what a select with nothing chosen has
     * always shown — "Status", "Payment" — so the closed dropdown says what it
     * is for.
     *
     * Pass "All statuses" and so on where the top option should say All. It
     * has to carry the label WITH it: four dropdowns all reading a bare "All"
     * are four dropdowns nobody can tell apart, and the closed select is the
     * only place their name appears.
     */
    allLabel?: string;
  }[];
  /**
   * Picking an option applies it, and the Apply button becomes Clear.
   *
   * OPT-IN, not the default. The admin lists use this same bar to narrow
   * thousands of rows, where somebody usually sets two or three things and
   * then looks — applying on each one would be two wasted page loads out of
   * three. A customer filtering their own orders is setting one thing and
   * expecting an answer, which is a different job.
   *
   * The search box never auto-applies either way: a text field that navigates
   * on every keystroke is a page load per letter. With the button gone it
   * submits on Enter.
   */
  autoApply?: boolean;
  /**
   * What the clear button reads. Defaults to "Clear".
   *
   * "Clear all" on a bar carrying five filters, because one press drops
   * every one of them and the shorter word invites the belief that it
   * clears whichever was touched last. The default is left alone so the
   * two screens already using this are unchanged.
   */
  clearLabel?: string;
  /**
   * Filters in force that this bar has no control for.
   *
   * The bar rebuilds the whole query string from its own fields, so a
   * parameter it cannot see is a parameter it silently drops. That is a
   * quiet bug rather than a loud one: on the product list, showing the
   * sample products and then picking a category would have hidden them
   * again with nothing to say it had happened.
   *
   * Carried as hidden inputs so one press of clear still drops them —
   * clear means clear.
   */
  carry?: Record<string, string | undefined>;
}) {
  const router = useRouter();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const next = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      const v = String(value).trim();
      if (v) next.set(key, v);
    }
    const qs = next.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  const hasFilters =
    Boolean(searchValue) || selects.some((s) => Boolean(s.value));

  return (
    <form
      onSubmit={submit}
      className="mt-4 flex flex-wrap items-end gap-2 rounded-card border border-border-base bg-surface p-3 shadow-card"
    >
      {Object.entries(carry).map(([name, value]) =>
        value ? (
          <input key={name} type="hidden" name={name} value={value} />
        ) : null,
      )}

      {searchName && (
        <input
          name={searchName}
          defaultValue={searchValue}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder ?? "Search"}
          className="min-w-[14rem] flex-1 rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none"
        />
      )}

      {selects.map((select) => (
        <select
          key={select.name}
          name={select.name}
          defaultValue={select.value}
          aria-label={select.label}
          // requestSubmit, not submit(): it fires the form's submit event so
          // the handler above still runs and still drops the empty values.
          // submit() would bypass it and leave ?payment=&status= behind.
          onChange={
            autoApply
              ? (event) => event.currentTarget.form?.requestSubmit()
              : undefined
          }
          className={`rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none ${
            autoApply ? "cursor-pointer" : ""
          }`}
        >
          <option value="">{select.allLabel ?? select.label}</option>
          {select.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ))}

      {/*
        With auto-apply there is nothing for Apply to do, so Clear takes its
        place rather than the slot emptying — a bar that loses a button when a
        filter is set is a bar that jumps under the pointer.

        It is always there in that mode, and does no harm pressed with nothing
        set: it navigates to the unfiltered page, which is where you already
        are.
      */}
      {autoApply ? (
        <button
          type="button"
          onClick={() => router.push(basePath)}
          className="cursor-pointer rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover"
        >
          {clearLabel}
        </button>
      ) : (
        <>
          <button
            type="submit"
            className="rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover"
          >
            Apply
          </button>

          {hasFilters && (
            <button
              type="button"
              onClick={() => router.push(basePath)}
              className="rounded-card px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:text-navy"
            >
              {clearLabel}
            </button>
          )}
        </>
      )}
    </form>
  );
}
