import Link from "next/link";

/** Builds a page href preserving every other active filter. */
function pageHref(params: Record<string, string | undefined>, page: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `/products?${qs}` : "/products";
}

export function Pagination({
  page,
  pageCount,
  params,
}: {
  page: number;
  pageCount: number;
  params: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) return null;

  // Window of pages around the current one, always including first and last.
  const pages = new Set<number>([1, pageCount]);
  for (let p = page - 1; p <= page + 1; p += 1) {
    if (p >= 1 && p <= pageCount) pages.add(p);
  }
  const ordered = [...pages].sort((a, b) => a - b);

  const linkBase =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-card border px-3 text-sm transition-colors";

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1.5">
      <Link
        href={pageHref(params, page - 1)}
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
              href={pageHref(params, p)}
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
        href={pageHref(params, page + 1)}
        aria-disabled={page === pageCount}
        tabIndex={page === pageCount ? -1 : undefined}
        className={`${linkBase} border-border-base bg-surface text-text-muted hover:bg-surface-hover ${
          page === pageCount ? "pointer-events-none opacity-40" : ""
        }`}
      >
        Next
      </Link>
    </nav>
  );
}
