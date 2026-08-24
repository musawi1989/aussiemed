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
import { REPORT_TABS } from "../tabs";
import { formatAED } from "@/lib/money";
import { topBy } from "@/lib/reporting";
import { customerReport } from "@/lib/reports-data";

export const metadata: Metadata = {
  title: "Customer reports",
  robots: { index: false, follow: false },
};

const aed = (fils: number) => formatAED(fils / 100);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

/**
 * What customers bought, and what they wanted and did not buy.
 *
 * Every money figure excludes VAT. VAT is collected on the government's behalf
 * rather than earned, and a revenue line that includes it flatters every total
 * on the page.
 */
export default async function CustomerReportsPage() {
  const report = await customerReport();

  const topAccounts = topBy(
    report.accounts,
    (a) => a.spendFils,
    (a) => a.name,
    10,
  );
  const topCategories = topBy(
    report.categories,
    (c) => c.revenueFils,
    (c) => c.name,
    10,
  );

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">
          Customers
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          The last twelve months. All figures exclude VAT.
        </p>
      </div>

      <SectionTabs tabs={REPORT_TABS} />

      <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Orders" value={String(report.totals.orders)} />
        <Figure
          label="Revenue"
          value={aed(report.totals.revenueFils)}
          note="excluding VAT"
        />
        <Figure
          label="Average order"
          value={
            report.totals.orders === 0
              ? "—"
              : aed(
                  Math.round(report.totals.revenueFils / report.totals.orders),
                )
          }
        />
        <Figure
          label="Accounts that ordered"
          value={String(report.accounts.length)}
        />
      </ul>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ReportPanel
          title="Revenue by month"
          hint="Months with nothing in them are shown, because an empty month is news."
        >
          <Bars
            rows={report.months.map((m) => ({
              key: m.key,
              label: m.label,
              value: m.revenueFils,
              note: `${m.orders} order${m.orders === 1 ? "" : "s"}`,
            }))}
          />
        </ReportPanel>

        <ReportPanel
          title="Who spends the most"
          hint="Top ten accounts by spend."
        >
          {topAccounts.length === 0 ? (
            <Nothing>No orders in the last twelve months.</Nothing>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-base text-left text-xs uppercase tracking-wide text-text-subtle">
                    <th className="py-1.5 pr-3 font-bold">Account</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Orders</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Spend</th>
                    <th className="py-1.5 pr-3 text-right font-bold">
                      Average
                    </th>
                    <th className="py-1.5 text-right font-bold">Last</th>
                  </tr>
                </thead>
                <tbody>
                  {topAccounts.map((account) => (
                    <tr
                      key={account.organisationId}
                      className="border-b border-border-base last:border-0"
                    >
                      <td className="py-1.5 pr-3 font-semibold text-text">
                        {account.name}
                      </td>
                      <td className="py-1.5 pr-3 text-right tnum text-text-muted">
                        {account.orders}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-bold tnum text-text">
                        {aed(account.spendFils)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tnum text-text-muted">
                        {aed(account.averageFils)}
                      </td>
                      <td className="py-1.5 text-right tnum text-text-muted">
                        {day(account.lastOrderAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportPanel>

        <ReportPanel
          title="What sells"
          hint="By the deepest category a product sits in — the one people browse by."
        >
          <Bars
            rows={topCategories.map((c) => ({
              key: c.name,
              label: c.name,
              value: c.revenueFils,
              note: `${c.units} unit${c.units === 1 ? "" : "s"}`,
            }))}
            total={report.totals.revenueFils}
            emptyLabel="Nothing has been sold yet."
          />
        </ReportPanel>

        <ReportPanel
          title="Saved but not bought"
          hint="What buyers have put on their lists. A saved product nobody can buy is a gap worth closing."
        >
          {report.saved.length === 0 ? (
            <Nothing>Nobody has saved anything yet.</Nothing>
          ) : (
            <ol className="space-y-1.5">
              {report.saved.map((row) => (
                <li
                  key={row.productId}
                  // A grid rather than flex-wrap: medical product names run to
                  // a dozen words, and wrapping pushed the count onto its own
                  // line, which left the column unreadable.
                  className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-border-base pb-1.5 last:border-0"
                >
                  <Link
                    href={`/products/${row.slug}`}
                    className="text-sm leading-snug text-text hover:text-navy"
                  >
                    {row.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2 text-sm">
                    {!row.listed && (
                      <span className="whitespace-nowrap rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger">
                        not buyable
                      </span>
                    )}
                    <span className="font-bold tnum text-text">
                      {row.savedBy}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </ReportPanel>
      </div>
    </>
  );
}
