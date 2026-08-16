import type { Metadata } from "next";
import Link from "next/link";
import { SectionTabs } from "@/components/admin/SectionTabs";
import {
  Bars,
  Figure,
  Nothing,
  ReportPanel,
  Unknown,
} from "@/components/admin/ReportBits";
import { SUPPLIER_TABS } from "../tabs";
import { formatAED } from "@/lib/money";
import { humanDuration } from "@/lib/lifecycle";
import { topBy } from "@/lib/reporting";
import { supplierReport } from "@/lib/reports-data";

export const metadata: Metadata = {
  title: "Supplier reports",
  robots: { index: false, follow: false },
};

const aed = (fils: number) => formatAED(fils / 100);

/**
 * How each supplier is actually performing.
 *
 * Two restraints run through this screen, and both come from the platform's
 * own principles rather than from taste. Durations are reported as a median
 * and a P90, never an average — one order that sat over Eid moves a mean and
 * describes nobody's experience. And nothing is ranked or scored
 * automatically: this produces figures for a person to take into a
 * conversation with a supplier, which is what a relationship-led distributor
 * needs, rather than a league table that quietly reroutes business.
 */
export default async function SupplierReportsPage() {
  const report = await supplierReport();

  const bySpend = topBy(
    report.suppliers.filter((s) => s.spendFils !== null),
    (s) => s.spendFils ?? 0,
    (s) => s.name,
    10
  );

  const anyPromise = report.suppliers.some((s) => s.promisedAckHours !== null);

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">Suppliers</h1>
        <p className="mt-1 text-sm text-text-muted">
          The last twelve months, from what we have actually bought.
        </p>
      </div>

      <SectionTabs tabs={SUPPLIER_TABS} />

      <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Purchase orders" value={String(report.totals.purchaseOrders)} />
        <Figure
          label="Spent"
          value={aed(report.totals.spendFils)}
          note={
            report.totals.unknownCostOrders > 0
              ? `excludes ${report.totals.unknownCostOrders} with no recorded cost`
              : undefined
          }
        />
        <Figure label="Suppliers" value={String(report.suppliers.length)} />
        <Figure
          label="Not taking orders"
          value={String(report.suppliers.filter((s) => !s.available).length)}
        />
      </ul>

      {report.totals.unknownCostOrders > 0 && (
        <p className="mt-4 rounded-card border-l-4 border-accent-border bg-accent-soft px-4 py-2.5 text-sm text-text tnum">
          {report.totals.unknownCostOrders} purchase order
          {report.totals.unknownCostOrders === 1 ? " has" : "s have"} a line with
          no recorded cost, so {report.totals.unknownCostOrders === 1 ? "it is" : "they are"}{" "}
          left out of every money figure here rather than counted as free.
        </p>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ReportPanel title="Spend by month">
          <Bars
            rows={report.months.map((m) => ({
              key: m.key,
              label: m.label,
              value: m.spendFils,
              note: `${m.orders} order${m.orders === 1 ? "" : "s"}`,
            }))}
          />
        </ReportPanel>

        <ReportPanel
          title="Spend by supplier"
          hint="Only what we can price. Orders with an uncosted line are not in these bars."
        >
          <Bars
            rows={bySpend.map((s) => ({
              key: s.id,
              label: s.name,
              value: s.spendFils ?? 0,
            }))}
            total={report.totals.spendFils}
            emptyLabel="Nothing has been bought yet."
          />
        </ReportPanel>
      </div>

      <div className="mt-5">
        <ReportPanel
          title="How each supplier is doing"
          hint="Acknowledgement times come from the order log. Median and P90 rather than an average — one order that sat over a holiday moves a mean and describes nobody's experience."
        >
          {report.suppliers.length === 0 ? (
            <Nothing>No suppliers set up yet.</Nothing>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-base text-left text-xs uppercase tracking-wide text-text-subtle">
                    <th className="py-1.5 pr-3 font-bold">Supplier</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Packs</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Orders</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Spend</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Acknowledges in</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Worst 10%</th>
                    <th className="py-1.5 pr-3 text-right font-bold">On time</th>
                    <th className="py-1.5 text-right font-bold">Fallback</th>
                  </tr>
                </thead>
                <tbody>
                  {report.suppliers.map((supplier) => (
                    <tr
                      key={supplier.id}
                      className="border-b border-border-base last:border-0"
                    >
                      <td className="py-2 pr-3">
                        <Link
                          href={`/admin/suppliers/${supplier.id}`}
                          className="font-semibold text-navy hover:underline"
                        >
                          {supplier.name}
                        </Link>
                        <span className="block text-xs text-text-subtle">
                          {supplier.status}
                          {!supplier.available && (
                            <span className="ml-1.5 font-bold text-accent">
                              not taking orders
                            </span>
                          )}
                        </span>
                      </td>

                      <td className="py-2 pr-3 text-right tnum text-text-muted">
                        {supplier.supplies}
                        {supplier.unavailable > 0 && (
                          <span
                            className="ml-1 text-accent"
                            title={`${supplier.unavailable} they cannot currently supply`}
                          >
                            &minus;{supplier.unavailable}
                          </span>
                        )}
                      </td>

                      <td className="py-2 pr-3 text-right tnum text-text-muted">
                        {supplier.purchaseOrders}
                      </td>

                      <td className="py-2 pr-3 text-right font-bold tnum text-text">
                        {supplier.spendFils === null ? (
                          <Unknown>no costs</Unknown>
                        ) : (
                          aed(supplier.spendFils)
                        )}
                        {supplier.ordersWithUnknownCost > 0 &&
                          supplier.spendFils !== null && (
                            <span
                              className="ml-1 text-xs font-normal text-text-subtle"
                              title={`${supplier.ordersWithUnknownCost} order(s) with no recorded cost are not counted`}
                            >
                              +{supplier.ordersWithUnknownCost}?
                            </span>
                          )}
                      </td>

                      <td className="py-2 pr-3 text-right tnum text-text">
                        {supplier.acknowledgement.enough ? (
                          humanDuration(supplier.acknowledgement.medianMs)
                        ) : (
                          <Unknown>
                            {supplier.acknowledgement.count === 0
                              ? "no orders yet"
                              : `only ${supplier.acknowledgement.count}`}
                          </Unknown>
                        )}
                      </td>

                      <td className="py-2 pr-3 text-right tnum text-text-muted">
                        {supplier.acknowledgement.enough ? (
                          humanDuration(supplier.acknowledgement.p90Ms)
                        ) : (
                          <Unknown>—</Unknown>
                        )}
                      </td>

                      <td className="py-2 pr-3 text-right tnum">
                        {supplier.promisedAckHours === null ? (
                          <Unknown>no target</Unknown>
                        ) : supplier.onTimePercent === null ? (
                          <Unknown>not enough</Unknown>
                        ) : (
                          <span
                            className={`font-bold ${
                              supplier.onTimePercent >= 90
                                ? "text-success"
                                : supplier.onTimePercent >= 70
                                  ? "text-accent"
                                  : "text-danger"
                            }`}
                          >
                            {supplier.onTimePercent}%
                          </span>
                        )}
                      </td>

                      <td className="py-2 text-right tnum text-text-muted">
                        {supplier.fallbackLines > 0 ? (
                          <span
                            title="Lines that came to them because the first choice could not supply"
                            className="font-semibold text-accent"
                          >
                            {supplier.fallbackLines}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!anyPromise && (
            <p className="mt-3 rounded-card border-l-4 border-accent-border bg-accent-soft px-3 py-2 text-sm text-text">
              No supplier has an agreed acknowledgement window recorded, so
              nothing can be called on time or late. Set one on each
              supplier&rsquo;s page — it is a number agreed with them, not one
              we can work out.
            </p>
          )}

          <p className="mt-3 text-xs leading-relaxed text-text-subtle">
            Nothing here ranks or scores a supplier automatically. These are
            figures to take into a conversation, not a league table that
            quietly reroutes business.
          </p>
        </ReportPanel>
      </div>
    </>
  );
}
