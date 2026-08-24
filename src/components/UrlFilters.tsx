"use client";

import { useRouter } from "next/navigation";

/**
 * Filters that live in the URL.
 *
 * A GET form would do this on its own, but it would also carry every empty
 * select along as `?status=&supplier=`, which makes a shared link unreadable
 * and a bookmark misleading. So the form is intercepted, empty values are
 * dropped, and paging resets — changing a filter while on page 4 of the old
 * result set is never what anyone meant.
 */
export function AdminFilters({
  basePath,
  searchName,
  searchValue,
  searchPlaceholder,
  selects = [],
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
  }[];
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
          className="rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none"
        >
          <option value="">{select.label}</option>
          {select.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ))}

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
          Clear
        </button>
      )}
    </form>
  );
}
