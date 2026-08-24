import type { Metadata } from "next";
import { formatAED } from "@/lib/money";
import { productPerformance } from "@/lib/reports-data";
import {
  MIN_ORDERS_TO_RANK,
  coverageOf,
  mostProfitable,
  mostPurchased,
  ownBrandCandidates,
  spendByCategory,
} from "@/lib/own-brand";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { REPORT_TABS } from "../tabs";

export const metadata: Metadata = {
  title: "Product performance",
  robots: { index: false, follow: false },
};

const aed = (fils: number) => formatAED(fils / 100);

/**
 * What earns, what moves, and what to put our own label on — FE-45.
 *
 * Everything here is ex-VAT and comes from what was actually sold and actually
 * bought: revenue from the order lines, cost from the purchase allocations
 * behind them. It agrees with the order screen by construction, because both
 * ask margin.ts the same question.
 *
 * The screen leads with what it cannot see. A merchandising decision taken on
 * half the data is worse than one postponed, and on this database most of the
 * catalogue has never been costed.
 */
export default async function ProductReportsPage() {
  const { performance, orderCount } = await productPerformance();

  const coverage = coverageOf(performance, orderCount);
  const profitable = mostProfitable(performance, 10);
  const purchased = mostPurchased(performance, 10);
  const candidates = ownBrandCandidates(performance, 10);
  const categories = spendByCategory(performance).slice(0, 10);

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">
          Product performance
        </h1>
        <p className="mt-1 max-w-prose text-sm text-text-muted">
          What earns, what moves, and what looks worth making our own. Every
          figure is ex-VAT, from orders that were not cancelled.
        </p>
      </div>

      <SectionTabs tabs={REPORT_TABS} />

      {/* ---------- what this report can and cannot see ---------- */}
      <section className="mt-4 rounded-card border border-border-base bg-surface p-4 shadow-card">
        <h2 className="text-xs font-bold uppercase tracking-wide text-text-subtle">
          What this is based on
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Figure label="Orders" value={String(coverage.orders)} />
          <Figure label="Products sold" value={String(coverage.productsSold)} />
          <Figure
            label="Of those, costed"
            value={`${coverage.productsCosted} of ${coverage.productsSold}`}
          />
          <Figure label="Units sold" value={String(coverage.unitsSold)} />
          <Figure
            label="Units with no cost"
            value={String(coverage.uncostedUnits)}
            warn={coverage.uncostedUnits > 0}
          />
        </dl>

        {!coverage.enoughToRank && (
          <p className="mt-3 rounded-card border border-accent-border bg-accent-soft px-3 py-2 text-sm leading-relaxed text-accent">
            <strong className="font-semibold">
              Too few orders to rank anything yet.
            </strong>{" "}
            Below {MIN_ORDERS_TO_RANK} orders a league table is noise wearing a
            suit. The tables below are shown so the shape can be checked, and
            should not be acted on until real clients are ordering.
          </p>
        )}

        {coverage.uncostedUnits > 0 && (
          <p className="mt-3 text-sm leading-relaxed text-text-muted">
            {coverage.uncostedUnits} units were sold on lines with no recorded
            cost, so they count towards volume and not towards profit. A missing
            cost is unknown, never zero — see BE-45. Load costs through the
            catalogue upload and these lines join the ranking.
          </p>
        )}
      </section>

      {/* ---------- own brand ---------- */}
      <section className="mt-5 rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight text-text">
          Worth making our own
        </h2>
        <p className="mt-1 max-w-prose text-sm text-text-muted">
          Scored on volume, how many accounts buy it, how thin the margin is
          today and how often it is reordered. The thin margins are deliberate:
          a line where the brand takes most of the money is the line worth
          owning, while the ones already earning well need no help from us.
        </p>

        {candidates.length === 0 ? (
          <Empty>
            Nothing can be scored yet — it needs at least one product that has
            been sold and costed.
          </Empty>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <Head>
                  <th className="py-1.5 pr-3 text-left font-bold">Product</th>
                  <th className="py-1.5 pr-3 text-right font-bold">Score</th>
                  <th className="py-1.5 pr-3 text-right font-bold">Units</th>
                  <th className="py-1.5 pr-3 text-right font-bold">Accounts</th>
                  <th className="py-1.5 pr-3 text-right font-bold">Margin</th>
                  <th className="py-1.5 text-left font-bold">Why</th>
                </Head>
              </thead>
              <tbody>
                {candidates.map((row) => (
                  <tr key={row.slug} className="border-b border-border-base last:border-0">
                    <td className="py-2 pr-3">
                      <span className="font-semibold text-text">{row.name}</span>
                      <span className="block text-xs text-text-subtle">
                        {[row.brand, row.category].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-bold tnum text-navy">
                      {row.score}
                    </td>
                    <td className="py-2 pr-3 text-right tnum text-text">{row.units}</td>
                    <td className="py-2 pr-3 text-right tnum text-text-muted">
                      {row.customers}
                    </td>
                    <td className="py-2 pr-3 text-right tnum text-text-muted">
                      {row.marginPercent}%
                    </td>
                    <td className="py-2 text-xs text-text-muted">
                      {row.reasons.join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* ---------- most profitable ---------- */}
        <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
          <h2 className="text-base font-bold tracking-tight text-text">
            Earns the most
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Gross profit, not margin. Sixty per cent of one box a year is worth
            less than twelve per cent of four hundred.
          </p>

          {profitable.length === 0 ? (
            <Empty>Nothing sold has a cost recorded against it yet.</Empty>
          ) : (
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <Head>
                  <th className="py-1.5 pr-3 text-left font-bold">Product</th>
                  <th className="py-1.5 pr-3 text-right font-bold">Profit</th>
                  <th className="py-1.5 text-right font-bold">Margin</th>
                </Head>
              </thead>
              <tbody>
                {profitable.map((row) => (
                  <tr key={row.slug} className="border-b border-border-base last:border-0">
                    <td className="py-2 pr-3">
                      <span className="text-text">{row.name}</span>
                      <span className="block text-xs text-text-subtle tnum">
                        {row.units} units · {aed(row.revenueFils)} sold
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-bold tnum text-text">
                      {aed(row.profitFils ?? 0)}
                    </td>
                    <td className="py-2 text-right tnum text-text-muted">
                      {row.marginPercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ---------- most purchased ---------- */}
        <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
          <h2 className="text-base font-bold tracking-tight text-text">
            Moves the most
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            By units. Includes lines with no cost recorded, because volume is
            knowable without one.
          </p>

          {purchased.length === 0 ? (
            <Empty>Nothing has been ordered yet.</Empty>
          ) : (
            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <Head>
                  <th className="py-1.5 pr-3 text-left font-bold">Product</th>
                  <th className="py-1.5 pr-3 text-right font-bold">Units</th>
                  <th className="py-1.5 text-right font-bold">Orders</th>
                </Head>
              </thead>
              <tbody>
                {purchased.map((row) => (
                  <tr key={row.slug} className="border-b border-border-base last:border-0">
                    <td className="py-2 pr-3">
                      <span className="text-text">{row.name}</span>
                      <span className="block text-xs text-text-subtle">
                        {row.customers} account{row.customers === 1 ? "" : "s"}
                        {row.uncostedUnits > 0 ? " · no cost recorded" : ""}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right font-bold tnum text-text">
                      {row.units}
                    </td>
                    <td className="py-2 text-right tnum text-text-muted">{row.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* ---------- by category ---------- */}
      <section className="mt-5 rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight text-text">
          Where the money goes, by shelf
        </h2>
        <p className="mt-1 max-w-prose text-sm text-text-muted">
          An own brand is usually launched as a range rather than a single line,
          and a range is what a shelf tells you.
        </p>

        {categories.length === 0 ? (
          <Empty>Nothing sold yet.</Empty>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <Head>
                  <th className="py-1.5 pr-3 text-left font-bold">Shelf</th>
                  <th className="py-1.5 pr-3 text-right font-bold">Lines</th>
                  <th className="py-1.5 pr-3 text-right font-bold">Units</th>
                  <th className="py-1.5 pr-3 text-right font-bold">Sold</th>
                  <th className="py-1.5 pr-3 text-right font-bold">Profit</th>
                  <th className="py-1.5 text-right font-bold">Margin</th>
                </Head>
              </thead>
              <tbody>
                {categories.map((row) => (
                  <tr key={row.category} className="border-b border-border-base last:border-0">
                    <td className="py-2 pr-3 text-text">{row.category}</td>
                    <td className="py-2 pr-3 text-right tnum text-text-muted">
                      {row.products}
                    </td>
                    <td className="py-2 pr-3 text-right tnum text-text-muted">
                      {row.units}
                    </td>
                    <td className="py-2 pr-3 text-right tnum text-text">
                      {aed(row.revenueFils)}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold tnum text-text">
                      {row.profitFils === null ? "—" : aed(row.profitFils)}
                    </td>
                    <td className="py-2 text-right tnum text-text-muted">
                      {row.marginPercent === null ? "—" : `${row.marginPercent}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Figure({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-lg font-bold tnum ${warn ? "text-accent" : "text-text"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Head({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-b border-border-base text-xs uppercase tracking-wide text-text-subtle">
      {children}
    </tr>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-card border border-border-base bg-surface-sunken px-3 py-3 text-sm leading-relaxed text-text-muted">
      {children}
    </p>
  );
}
