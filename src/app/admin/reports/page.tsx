import type { Metadata } from "next";
import { formatAED } from "@/lib/money";
import { productPerformance } from "@/lib/reports-data";
import { MIN_ORDERS_TO_RANK, coverageOf } from "@/lib/own-brand";
import { byProfit, losingMoney, profitTotals } from "@/lib/profit-report";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { REPORT_TABS } from "./tabs";

export const metadata: Metadata = {
  title: "Profit",
  robots: { index: false, follow: false },
};

const aed = (fils: number) => formatAED(fils / 100);

/**
 * What we buy for, what we sell for, and the difference — FE-66.
 *
 * Everything here is EX-VAT and comes from what actually happened: revenue
 * from the order lines, cost from the purchase allocations behind them. It
 * agrees with the order screen and the product screen by construction, because
 * all three ask margin.ts the same question rather than each doing their own
 * subtraction.
 *
 * ⚠ A MISSING COST IS UNKNOWN, NOT ZERO. A line sold before its cost was
 * loaded contributes revenue and no profit, and is left out of the margin
 * rather than counted as pure gain — otherwise every uncosted sale reports a
 * 100% margin and the total becomes a number that gets believed. The screen
 * leads with how much of itself it cannot see, for the same reason.
 *
 * The totals and the ordering are pure in profit-report.ts with tests; this
 * file only renders them.
 */
export default async function ProfitReportPage() {
  const { performance, orderCount } = await productPerformance();

  const totals = profitTotals(performance);
  const coverage = coverageOf(performance, orderCount);
  const rows = byProfit(performance);
  const losing = losingMoney(performance);

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">Profit</h1>
        <p className="mt-1 max-w-prose text-sm text-text-muted">
          What each product sold for, what we paid our suppliers for it, and the
          difference. Ex-VAT, from orders placed and stock actually bought
          against them.
        </p>
      </div>

      <SectionTabs tabs={REPORT_TABS} />

      {/* ---------- the headline ---------- */}
      <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Sold for" value={aed(totals.costedRevenueFils)} />
        <Figure label="We paid" value={aed(totals.costFils)} />
        <Figure
          label="Profit"
          value={aed(totals.profitFils)}
          tone={totals.profitFils < 0 ? "bad" : "good"}
          big
        />
        <Figure
          label="Margin"
          value={totals.marginPercent === null ? "—" : `${totals.marginPercent}%`}
          tone={
            totals.marginPercent === null
              ? undefined
              : totals.marginPercent < 0
                ? "bad"
                : undefined
          }
        />
      </section>

      {/* ---------- what it cannot see, before what it can ---------- */}
      <section className="mt-4 rounded-card border border-border-base bg-surface p-4 shadow-card">
        <h2 className="text-xs font-bold uppercase tracking-wide text-text-subtle">
          What this is based on
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          {coverage.orders} order{coverage.orders === 1 ? "" : "s"} &middot;{" "}
          {totals.unitsSold} unit{totals.unitsSold === 1 ? "" : "s"} sold across{" "}
          {totals.productsSold} product{totals.productsSold === 1 ? "" : "s"},{" "}
          {totals.productsCosted} of which we know the cost of.
        </p>

        {totals.uncostedUnits > 0 && (
          <p className="mt-3 rounded-card border border-attention-border bg-attention-soft px-3 py-2 text-sm leading-relaxed text-attention-text">
            <strong className="font-semibold">
              {aed(totals.uncostedRevenueFils)} of sales is not in the profit
              figure.
            </strong>{" "}
            {totals.uncostedUnits} unit
            {totals.uncostedUnits === 1 ? " was" : "s were"} sold on lines with
            no recorded supplier cost. A missing cost is unknown, never zero
            (BE-45) &mdash; counting it as free would report profit we did not
            make. Load costs through the catalogue upload and those lines join
            the figures above.
          </p>
        )}

        {!coverage.enoughToRank && (
          <p className="mt-3 rounded-card border border-accent-border bg-accent-soft px-3 py-2 text-sm leading-relaxed text-accent">
            <strong className="font-semibold">
              Too few orders for this to mean much yet.
            </strong>{" "}
            Below {MIN_ORDERS_TO_RANK} orders these are arithmetic rather than a
            trend. Shown so the shape can be checked, not so it can be acted on.
          </p>
        )}
      </section>

      {/* ---------- selling at a loss ---------- */}
      {losing.length > 0 && (
        <section className="mt-5 rounded-card border border-danger bg-danger-soft p-5">
          <h2 className="text-base font-bold tracking-tight text-danger">
            Selling at or below cost ({losing.length})
          </h2>
          <p className="mt-1 max-w-prose text-sm text-danger">
            Worth a look before anything else on this page. Usually a price
            loaded against the wrong cost, or a cost that rose without the price
            following it.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-danger">
            {losing.map((row) => (
              <li key={row.slug} className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold">{row.name}</span>
                <span className="tnum">
                  sold {aed(row.costedRevenueFils)} &middot; paid{" "}
                  {aed(row.costFils ?? 0)} &middot;{" "}
                  <strong>{aed(row.profitFils ?? 0)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- the table ---------- */}
      <section className="mt-5 rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight text-text">
          By product
        </h2>
        <p className="mt-1 max-w-prose text-sm text-text-muted">
          Ordered by gross profit, not by margin: 8% of a pallet a week is worth
          more than 60% of one box a year. Products we have no cost for sit at
          the bottom &mdash; they are real sales, and the ones to go and cost.
        </p>

        {rows.length === 0 ? (
          <p className="mt-4 rounded-card bg-surface-sunken px-3 py-6 text-center text-sm text-text-muted">
            Nothing has been sold yet, so there is no profit to report.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-card border border-border-base">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-base text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Units</th>
                  <th className="px-3 py-2 text-right">Sold for</th>
                  <th className="px-3 py-2 text-right">We paid</th>
                  <th className="px-3 py-2 text-right">Profit</th>
                  <th className="px-3 py-2 text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const unknown = row.profitFils === null;
                  const loss = !unknown && (row.profitFils ?? 0) < 0;
                  return (
                    <tr
                      key={row.slug}
                      className="border-b border-border-base last:border-0"
                    >
                      <td className="px-3 py-2">
                        <span className="font-semibold text-text">{row.name}</span>
                        {(row.brand || row.category) && (
                          <span className="block text-xs text-text-subtle">
                            {[row.brand, row.category].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tnum text-text-muted">
                        {row.units}
                      </td>
                      {unknown ? (
                        /* One cell across the money columns rather than three
                           em dashes: it says once, in words, why the row is
                           different — and stops a reader hunting for the
                           figure that is missing. */
                        <td
                          colSpan={4}
                          className="px-3 py-2 text-right text-xs text-text-subtle"
                        >
                          sold {aed(row.revenueFils)} &middot; no supplier cost
                          recorded, so no profit can be shown
                        </td>
                      ) : (
                        <>
                          <td className="whitespace-nowrap px-3 py-2 text-right tnum text-text-muted">
                            {aed(row.costedRevenueFils)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tnum text-text-muted">
                            {aed(row.costFils ?? 0)}
                          </td>
                          <td
                            className={`whitespace-nowrap px-3 py-2 text-right font-bold tnum ${
                              loss ? "text-danger" : "text-text"
                            }`}
                          >
                            {aed(row.profitFils ?? 0)}
                          </td>
                          <td
                            className={`whitespace-nowrap px-3 py-2 text-right tnum ${
                              loss ? "text-danger" : "text-text-muted"
                            }`}
                          >
                            {row.marginPercent === null
                              ? "—"
                              : `${row.marginPercent}%`}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border-strong">
                  <td className="px-3 py-2 font-bold text-text">Total</td>
                  <td className="px-3 py-2 text-right tnum text-text-muted">
                    {totals.unitsSold}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tnum text-text-muted">
                    {aed(totals.costedRevenueFils)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tnum text-text-muted">
                    {aed(totals.costFils)}
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-2 text-right text-base font-bold tnum ${
                      totals.profitFils < 0 ? "text-danger" : "text-text"
                    }`}
                  >
                    {aed(totals.profitFils)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tnum text-text-muted">
                    {totals.marginPercent === null
                      ? "—"
                      : `${totals.marginPercent}%`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* The two revenue figures differ whenever anything is uncosted, and a
            reader who spots that deserves the reason rather than a puzzle. */}
        {totals.uncostedRevenueFils > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-text-subtle">
            The total sold here is {aed(totals.costedRevenueFils)}, not{" "}
            {aed(totals.revenueFils)}: it counts only the lines we know the cost
            of, so that the profit beside it is a like-for-like figure.
          </p>
        )}
      </section>
    </>
  );
}

function Figure({
  label,
  value,
  tone,
  big = false,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  big?: boolean;
}) {
  return (
    <div className="rounded-card border border-border-base bg-surface p-4 shadow-card">
      <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </p>
      <p
        className={`mt-1 font-bold tnum ${big ? "text-2xl" : "text-lg"} ${
          tone === "bad"
            ? "text-danger"
            : tone === "good"
              ? "text-success"
              : "text-text"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
