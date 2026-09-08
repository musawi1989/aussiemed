import type { Metadata } from "next";
import Link from "next/link";
import { searchAdmin, type SearchHit } from "@/lib/admin-search";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: false },
};

/**
 * What one string turned out to be.
 *
 * Grouped by kind rather than mixed into one ranked list. Somebody holding a
 * reference number knows what they are looking for and wants it first; someone
 * typing a company name wants to see that there are three of them. A single
 * relevance-ordered list serves neither.
 */
export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const term = q.trim();
  const hits = term.length >= 2 ? await searchAdmin(term) : [];

  const groups = ["Order", "Product", "Customer", "Supplier", "Purchase order"]
    .map((kind) => ({
      kind,
      items: hits.filter((h) => h.kind === kind),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="px-4 py-6 lg:px-8">
      <h1 className="text-xl font-bold tracking-tight text-text">
        {term ? <>Results for &ldquo;{term}&rdquo;</> : "Search"}
      </h1>

      {term.length > 0 && term.length < 2 && (
        <p className="mt-2 text-sm text-text-muted">
          Two characters or more, please — one letter matches most of the
          catalogue.
        </p>
      )}

      {term.length >= 2 && hits.length === 0 && (
        <div className="mt-4 rounded-card border border-border-base bg-surface px-4 py-8 text-center shadow-card">
          <p className="text-sm font-semibold text-text">
            Nothing matched &ldquo;{term}&rdquo;.
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
            This looks at order and purchase-order numbers, product names and
            item codes — ours and the supplier&rsquo;s — customer and supplier
            names, email addresses and TRNs.
          </p>
        </div>
      )}

      {!term && (
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          One box for the whole back office. Type a reference number, an item
          code, a company name or an email address.
        </p>
      )}

      <div className="mt-5 space-y-6">
        {groups.map((group) => (
          <section key={group.kind}>
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-subtle">
              {group.kind}
              {group.items.length === 1 ? "" : "s"}{" "}
              <span className="tnum text-text-muted">({group.items.length})</span>
            </h2>
            <ul className="mt-2 space-y-2">
              {group.items.map((hit) => (
                <Row key={`${hit.kind}-${hit.href}`} hit={hit} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {hits.length > 0 && (
        <p className="mt-6 text-xs text-text-subtle">
          Up to six of each kind. Narrow the term, or use the filters on the
          screen itself, to see more.
        </p>
      )}
    </div>
  );
}

function Row({ hit }: { hit: SearchHit }) {
  return (
    <li>
      <Link
        href={hit.href}
        className="flex items-baseline justify-between gap-3 rounded-card border border-border-base bg-surface px-4 py-3 shadow-card transition-colors hover:border-navy"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-text">
            {hit.title}
          </span>
          <span className="block truncate text-xs text-text-muted">
            {hit.detail}
          </span>
        </span>
        <span className="shrink-0 text-xs font-bold text-navy">Open</span>
      </Link>
    </li>
  );
}
