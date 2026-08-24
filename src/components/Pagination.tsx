import Link from "next/link";

/** Builds a page href preserving every other active filter. */
function pageHref(
  basePath: string,
  params: Record<string, string | undefined>,
  page: number,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * A windowed pager: first, last, and a few either side of where you are.
 *
 * ⚠ NEVER RENDER EVERY PAGE NUMBER. The admin product list used to, and at
 * 2,068 products that was 83 buttons wrapped over three lines below the
 * table — more pagination than content, and no way to tell where you were
 * in it. Whatever the total, this stays one row.
 */
export function Pagination({
  page,
  pageCount,
  params,
  basePath = "/products",
}: {
  page: number;
  pageCount: number;
  params: Record<string, string | undefined>;
  /** Defaults to the storefront, its first caller. */
  basePath?: string;
}) {
  if (pageCount <= 1) return null;

  // Window of pages around the current one, always including first and last.
  const pages = new Set<number>([1, pageCount]);
  for (let p = page - 2; p <= page + 2; p += 1) {
    if (p >= 1 && p <= pageCount) pages.add(p);
  }
  const ordered = [...pages].sort((a, b) => a - b);

  const linkBase =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-card border px-3 text-sm transition-colors";

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-center gap-1.5"
    >
      <Link
        href={pageHref(basePath, params, page - 1)}
        aria-disabled={page === 1}
        tabIndex={page === 1 ? -1 : undefined}
        className={`${linkBase} border-border-base bg-surface text-text-muted hover:bg-surface-hover ${
          page === 1 ? "pointer-events-none opacity-40" : ""
        }`}
      >
        Previous
      </Link>

      {ordered.map((p, i) => {
        const gap = i > 0 && p - ordered[i - 1] > 1;
        return (
          <span key={p} className="flex items-center gap-1.5">
            {gap && <span className="px-1 text-text-subtle">&hellip;</span>}
            <Link
              href={pageHref(basePath, params, p)}
              aria-current={p === page ? "page" : undefined}
              className={`${linkBase} tnum ${
                p === page
                  ? "border-brand bg-brand text-on-brand"
                  : "border-border-base bg-surface text-text hover:bg-surface-hover"
              }`}
            >
              {p}
            </Link>
          </span>
        );
      })}

      <Link
        href={pageHref(basePath, params, page + 1)}
        aria-disabled={page === pageCount}
        tabIndex={page === pageCount ? -1 : undefined}
        className={`${linkBase} border-border-base bg-surface text-text-muted hover:bg-surface-hover ${
          page === pageCount ? "pointer-events-none opacity-40" : ""
        }`}
      >
        Next
      </Link>

      {/* Said in words as well as shown. With a window you can see that
          there are more pages but not how many, and "page 4 of 83" is the
          thing somebody actually wants to know. */}
      <span className="ml-2 hidden text-xs text-text-subtle tnum sm:inline">
        page {page} of {pageCount}
      </span>
    </nav>
  );
}
