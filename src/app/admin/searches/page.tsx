import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { searchCounts, searchReport } from "@/lib/search-log";

export const metadata: Metadata = {
  title: "What people searched for",
  robots: { index: false, follow: false },
};

const when = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
  }).format(d);

/**
 * What visitors typed, and what they did not find.
 *
 * The list of terms that returned nothing is the most useful thing on this
 * screen and the reason it exists: for a distributor deciding what to source
 * next, it is customers saying what to stock, in their own words. Everything
 * else here is context for that list.
 *
 * Grouped by term, ordered by how often. Forty rows of "gloves" is one demand,
 * not forty.
 */
export default async function SearchesPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  await requireAdmin("orders", "view");

  const { all } = await searchParams;
  const emptyOnly = all !== "1";

  const [rows, counts] = await Promise.all([
    searchReport({ emptyOnly, sinceDays: 90 }),
    searchCounts(),
  ]);

  return (
    <div className="px-4 py-6 lg:px-8">
      <h1 className="text-xl font-bold tracking-tight text-text">
        What people searched for
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        Submitted searches from the last 90 days, grouped by what was typed. A
        search that found nothing is a customer telling you what to stock.
      </p>

      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Searches" value={counts.total} />
        <Stat
          label="Found nothing"
          value={counts.empty}
          warn={counts.empty > 0}
        />
        <Stat
          label="Of all searches"
          value={
            counts.total === 0
              ? "—"
              : `${Math.round((counts.empty / counts.total) * 100)}%`
          }
        />
      </ul>

      <nav className="mt-5 flex flex-wrap gap-1.5" aria-label="Filter">
        <Chip href="/admin/searches" active={emptyOnly} label="Found nothing" />
        <Chip href="/admin/searches?all=1" active={!emptyOnly} label="Everything" />
      </nav>

      {rows.length === 0 ? (
        <p className="mt-5 rounded-card border border-border-base bg-surface px-4 py-12 text-center text-sm text-text-muted shadow-card">
          {emptyOnly
            ? "Nothing yet — either nobody has searched, or everything they searched for was found."
            : "No searches recorded in the last 90 days."}
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-card border border-border-base bg-surface shadow-card">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-base text-left text-xs uppercase tracking-wide text-text-subtle">
                <th scope="col" className="px-4 py-2 font-bold">They typed</th>
                <th scope="col" className="px-4 py-2 text-right font-bold">Times</th>
                <th scope="col" className="px-4 py-2 text-right font-bold">Best results</th>
                <th scope="col" className="px-4 py-2 text-right font-bold">Last</th>
                <th scope="col" className="px-4 py-2 font-bold" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.normalised}
                  className="border-b border-border-base last:border-0"
                >
                  <td className="px-4 py-2.5 font-semibold text-text">
                    {row.term}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold tnum text-text">
                    {row.times}
                  </td>
                  <td className="px-4 py-2.5 text-right tnum">
                    {row.bestResultCount === 0 ? (
                      <span className="font-bold text-danger">none</span>
                    ) : (
                      <span className="text-text-muted">{row.bestResultCount}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tnum text-text-muted">
                    {when(row.lastAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {/* Straight to the search they ran, so the gap can be
                        seen rather than taken on trust. */}
                    <Link
                      href={`/products?q=${encodeURIComponent(row.term)}`}
                      className="text-xs font-bold text-navy hover:underline"
                    >
                      Try it
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-text-subtle">
        Repeated searches from one visitor within five minutes count once, so
        paging through results does not inflate a term. Singular and plural are
        kept apart deliberately — &ldquo;glove&rdquo; and &ldquo;gloves&rdquo;
        finding nothing are two pieces of evidence about wording.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: number | string;
  warn?: boolean;
}) {
  return (
    <li
      className={`rounded-card border bg-surface p-4 shadow-card ${
        warn ? "border-accent-border" : "border-border-base"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tnum text-text">{value}</p>
    </li>
  );
}

function Chip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-card px-3 py-1.5 text-sm font-bold transition-colors ${
        active
          ? "bg-navy text-on-navy"
          : "border border-border-strong bg-surface text-text-muted hover:text-navy"
      }`}
    >
      {label}
    </Link>
  );
}
