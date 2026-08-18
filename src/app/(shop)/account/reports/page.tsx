import type { Metadata } from "next";
import { BranchFilter } from "@/components/account/BranchFilter";
import { accountBranches } from "@/lib/account";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PeriodPicker } from "@/components/account/PeriodPicker";
import { accountReport } from "@/lib/account-reports";
import { accountSession } from "@/lib/account";
import { formatAED } from "@/lib/money";
import { resolvePeriod } from "@/lib/periods";
import { barWidth, share, topBy } from "@/lib/reporting";

export const metadata: Metadata = {
  title: "Spending",
  description:
    "What your practice has ordered and spent with AussieMed, over any period, with your invoices to download.",
};

const aed = (fils: number) => formatAED(fils / 100);
const day = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);

/**
 * A buyer's own spending, over whatever stretch of time they choose.
 *
 * Figures exclude VAT unless labelled otherwise. A registered business
 * reclaims VAT, so a spending total that quietly includes it overstates what
 * they have actually spent — and this is a page somebody takes to a budget
 * meeting.
 */
export default async function AccountReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    branch?: string;
  }>;
}) {
  const session = await accountSession();
  if (!session) redirect("/account");

  const params = await searchParams;
  const period = resolvePeriod({
    key: params.period,
    from: params.from,
    to: params.to,
  });

  const [report, branches] = await Promise.all([
    accountReport(period, params.branch),
    accountBranches(),
  ]);
  if (!report) redirect("/account");

  const topCategories = topBy(report.categories, (c) => c.netFils, (c) => c.name, 8);
  const maxMonth = report.months.reduce((n, m) => Math.max(n, m.netFils), 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-text">Spending</h2>
          <p className="mt-1 text-sm text-text-muted">
            {period.label}. All figures exclude VAT unless it says otherwise.
          </p>
        </div>

        {/* The period is kept when the branch changes, and the other way
            round. Losing the period on every branch click would make
            comparing two sites over the same months a chore. */}
        <BranchFilter
          basePath="/account/reports"
          branches={branches.map((b) => ({ id: b.id, label: b.label ?? b.city }))}
          active={params.branch}
          keep={{ period: params.period, from: params.from, to: params.to }}
        />
      </div>

      <div className="mt-4">
        <PeriodPicker
          activeKey={period.key}
          from={params.from ?? ""}
          to={params.to ?? ""}
        />
      </div>

      {report.firstOrderAt && period.key !== "all" && (
        <p className="mt-3 text-xs text-text-subtle tnum">
          Your first order with us was {day(report.firstOrderAt)}.
        </p>
      )}

      {/* --- the headline --- */}
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Orders" value={String(report.totals.orders)} />
        <Stat
          label="Spent"
          value={aed(report.totals.netFils)}
          note="excluding VAT"
        />
        <Stat
          label="Average order"
          value={report.totals.orders === 0 ? "—" : aed(report.totals.averageFils)}
        />
        <Stat label="Units bought" value={String(report.totals.units)} />
      </ul>

      {report.totals.orders === 0 ? (
        <p className="mt-5 rounded-card border border-border-base bg-surface px-4 py-12 text-center text-sm text-text-muted shadow-card">
          Nothing ordered in this period. Try a longer one, or{" "}
          <Link href="/products" className="font-bold text-navy hover:underline">
            browse the catalogue
          </Link>
          .
        </p>
      ) : (
        <>
          {/* --- over time --- */}
          <section className="mt-6 rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h3 className="text-base font-bold tracking-tight text-text">
              Month by month
            </h3>
            <p className="mt-1 text-sm text-text-muted">
              Months with nothing in them are shown, so a quiet month is
              visible rather than missing.
            </p>

            <ol className="mt-4 space-y-1.5">
              {report.months.map((month) => (
                <li
                  key={month.key}
                  className="grid grid-cols-[6rem_1fr_auto] items-center gap-3"
                >
                  <span className="text-sm text-text">{month.label}</span>
                  <span className="h-3 rounded-full bg-surface-sunken" aria-hidden="true">
                    <span
                      className="block h-3 rounded-full bg-navy"
                      style={{ width: `${barWidth(month.netFils, maxMonth)}%` }}
                    />
                  </span>
                  <span className="whitespace-nowrap text-right text-sm tnum">
                    <span className="font-bold text-text">{aed(month.netFils)}</span>
                    <span className="ml-2 text-text-subtle">
                      {month.orders} order{month.orders === 1 ? "" : "s"}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Panel title="What you buy" hint="By the category each item sits in.">
              <Breakdown
                rows={topCategories.map((c) => ({
                  name: c.name,
                  value: c.netFils,
                  note: `${c.units ?? 0} unit${(c.units ?? 0) === 1 ? "" : "s"}`,
                }))}
                total={report.totals.netFils}
              />
            </Panel>

            <Panel
              title="Where it goes"
              hint="Useful when each site has its own budget."
            >
              <Breakdown
                rows={report.branches.map((b) => ({
                  name: b.name,
                  value: b.netFils,
                  note: `${b.orders} order${b.orders === 1 ? "" : "s"}`,
                }))}
                total={report.totals.netFils}
              />
            </Panel>

            <Panel title="Who orders" hint="From the name chosen at checkout.">
              <Breakdown
                rows={report.people.map((p) => ({
                  name: p.name,
                  value: p.netFils,
                  note: `${p.orders} order${p.orders === 1 ? "" : "s"}`,
                }))}
                total={report.totals.netFils}
              />
            </Panel>

            <Panel
              title="VAT"
              hint="Shown separately, because a registered business reclaims it."
            >
              <dl className="space-y-2 text-sm">
                <Row label="Net" value={aed(report.totals.netFils)} />
                <Row label="VAT" value={aed(report.totals.vatFils)} />
                <Row label="Paid in total" value={aed(report.totals.totalFils)} bold />
              </dl>
            </Panel>
          </div>

          {/* --- invoices --- */}
          <section className="mt-5 rounded-card border border-border-base bg-surface p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold tracking-tight text-text">
                  Your invoices
                </h3>
                <p className="mt-1 max-w-xl text-sm text-text-muted">
                  Every order in this period. Open one to read it, print it, or
                  save it as a PDF.
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[42rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-base text-left text-xs uppercase tracking-wide text-text-subtle">
                    <th className="py-1.5 pr-3 font-bold">Reference</th>
                    <th className="py-1.5 pr-3 font-bold">Date</th>
                    <th className="py-1.5 pr-3 font-bold">Branch</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Net</th>
                    <th className="py-1.5 pr-3 text-right font-bold">VAT</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Total</th>
                    <th className="py-1.5 font-bold">Get it</th>
                  </tr>
                </thead>
                <tbody>
                  {report.invoices.map((invoice) => (
                    <tr
                      key={invoice.reference}
                      className="border-b border-border-base last:border-0"
                    >
                      <td className="py-2 pr-3">
                        <Link
                          href={`/orders/${invoice.reference}`}
                          className="font-bold tnum text-navy hover:underline"
                        >
                          {invoice.reference}
                        </Link>
                        {invoice.poReference && (
                          <span className="block text-xs text-text-subtle tnum">
                            your PO {invoice.poReference}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 tnum text-text-muted">
                        {day(invoice.placedAt)}
                      </td>
                      <td className="py-2 pr-3 text-text-muted">
                        {invoice.branch ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right tnum text-text">
                        {aed(invoice.netFils)}
                      </td>
                      <td className="py-2 pr-3 text-right tnum text-text-muted">
                        {aed(invoice.vatFils)}
                      </td>
                      <td className="py-2 pr-3 text-right font-bold tnum text-text">
                        {aed(invoice.totalFils)}
                      </td>
                      <td className="py-2">
                        <Link
                          href={`/account/invoices/${invoice.reference}`}
                          className="text-xs font-bold text-navy hover:underline"
                        >
                          Invoice
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-text-subtle">
              Open an invoice and print it to save it as a PDF. Every figure on
              this page is ex-VAT with VAT shown separately, and the period is
              in the address bar, so a link to what you are looking at can be
              sent to whoever needs it.
            </p>
          </section>
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <li className="rounded-card border border-border-base bg-surface p-4 shadow-card">
      <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tnum text-text">{value}</p>
      {note && <p className="mt-0.5 text-xs text-text-subtle">{note}</p>}
    </li>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
      <h3 className="text-base font-bold tracking-tight text-text">{title}</h3>
      {hint && <p className="mt-1 text-sm text-text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Breakdown({
  rows,
  total,
}: {
  rows: { name: string; value: number; note?: string }[];
  total: number;
}) {
  const max = rows.reduce((n, r) => Math.max(n, r.value), 0);

  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">Nothing in this period.</p>;
  }

  return (
    <ol className="space-y-1.5">
      {rows.map((row) => {
        const percent = share(row.value, total);
        return (
          <li key={row.name} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3">
            <span className="truncate text-sm text-text" title={row.name}>
              {row.name}
            </span>
            <span className="h-3 rounded-full bg-surface-sunken" aria-hidden="true">
              <span
                className="block h-3 rounded-full bg-navy"
                style={{ width: `${barWidth(row.value, max)}%` }}
              />
            </span>
            <span className="whitespace-nowrap text-right text-sm tnum">
              <span className="font-bold text-text">{formatAED(row.value / 100)}</span>
              {percent !== null && (
                <span className="ml-2 text-text-subtle">{percent}%</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-border-base pb-1.5 last:border-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className={`tnum ${bold ? "text-lg font-bold text-text" : "font-semibold text-text"}`}>
        {value}
      </dd>
    </div>
  );
}
