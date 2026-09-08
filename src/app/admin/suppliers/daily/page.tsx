import Link from "next/link";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { SUPPLIER_TABS } from "../tabs";
import {
  despatchedOn,
  dubaiToday,
  orderedOn,
  type DemandReport,
} from "@/lib/daily-demand";

/**
 * What a day was made of, item by item, and who wanted each thing.
 *
 * THE COST OF POOLING, PAID BACK. The buying run pools the day's demand into
 * one purchase order per supplier, which is what makes the quantities worth
 * pricing and is also why nobody could see who wanted what. "We are buying
 * eighty of these today" was on a screen; "twelve for Al Barsha, twenty for
 * Deira" was in nobody's reach without opening every order placed that day.
 *
 * Two views of the same day, because they are the same question at two points:
 * what customers asked us for, and what a supplier actually sent. The second
 * reads through the allocations, so a delivery of forty gloves comes back as
 * the customers it was bought for rather than as forty gloves.
 *
 * NOT FOR SENDING. Every line names customers. Under DEC-24 a supplier never
 * learns a customer exists — this is ours, and the daily list that does go to a
 * supplier is the purchase order, which carries quantities and item codes and
 * nothing else.
 */
export default async function SupplierDailyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const v = params[key];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };

  const today = dubaiToday();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(one("day")) ? one("day") : today;
  const view = one("view") === "despatched" ? "despatched" : "ordered";

  const report =
    view === "despatched" ? await despatchedOn(day) : await orderedOn(day);

  const shift = (by: number) => {
    const d = new Date(`${day}T12:00:00+04:00`);
    d.setUTCDate(d.getUTCDate() + by);
    return d.toISOString().slice(0, 10);
  };

  const href = (over: { day?: string; view?: string }) =>
    `/admin/suppliers/daily?view=${over.view ?? view}&day=${over.day ?? day}`;

  return (
    <>
      <SectionTabs tabs={SUPPLIER_TABS} />

      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">
          Daily demand
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-text-muted">
          Every item on a single day, how many, and which buyer wanted how much
          of each. The buying run pools this into one order per supplier, so
          this is the only place the individual demand behind a pooled quantity
          can be read back.
        </p>
      </div>

      {/* --- which day, which question --- */}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-card border border-border-strong bg-surface p-0.5">
          {(
            [
              ["ordered", "Ordered by customers"],
              ["despatched", "Sent to us by suppliers"],
            ] as const
          ).map(([value, label]) => (
            <Link
              key={value}
              href={href({ view: value })}
              className={`rounded-card px-3 py-1.5 text-xs font-bold transition-colors ${
                view === value
                  ? "bg-navy text-on-navy"
                  : "text-text-muted hover:text-navy"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={href({ day: shift(-1) })}
            className="inline-flex min-h-11 items-center gap-2 rounded-card border-2 border-navy bg-navy px-4 py-2 font-bold text-white border border-border-strong bg-surface px-2.5 py-1.5 text-xs transition-colors hover:bg-surface-hover"
          >
            &larr; {shift(-1)}
          </Link>
          <span className="rounded-card bg-surface-sunken px-3 py-1.5 text-sm font-bold tnum text-text">
            {day}
            {day === today && (
              <span className="ml-1.5 text-xs font-normal text-text-muted">
                today
              </span>
            )}
          </span>
          {/* No forward link past today: a day that has not happened has no
              demand, and a button that always returns "nothing" reads as
              broken rather than as empty. */}
          {day < today && (
            <Link
              href={href({ day: shift(1) })}
              className="rounded-card border border-border-strong bg-surface px-2.5 py-1.5 text-xs font-bold text-text transition-colors hover:bg-surface-hover"
            >
              {shift(1)} &rarr;
            </Link>
          )}
        </div>
      </div>

      <Summary report={report} view={view} />

      {report.lines.length === 0 ? (
        <p className="mt-4 rounded-card border border-border-base bg-surface px-4 py-10 text-center text-sm text-text-muted">
          {view === "ordered"
            ? "No orders were placed on this day."
            : "No supplier despatched anything on this day."}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-border-base bg-surface shadow-card">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-base bg-surface-sunken text-left text-xs uppercase tracking-wide text-text-subtle">
                <th scope="col" className="px-4 py-2 font-bold">Item</th>
                {view === "despatched" && (
                  <th scope="col" className="px-4 py-2 font-bold">From</th>
                )}
                <th scope="col" className="px-4 py-2 text-right font-bold">Units</th>
                <th scope="col" className="px-4 py-2 font-bold">
                  Who wanted it
                </th>
              </tr>
            </thead>
            <tbody>
              {report.lines.map((line) => (
                <tr
                  key={`${line.skuId}-${line.supplier ?? ""}`}
                  className="border-b border-border-base align-top last:border-0"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/products/${line.productId}`}
                      className="font-semibold text-text hover:text-navy hover:underline"
                    >
                      {line.name}
                    </Link>
                    <span className="block text-xs tnum text-text-subtle">
                      {line.skuCode} &middot; {line.unitLabel}
                    </span>
                  </td>
                  {view === "despatched" && (
                    <td className="px-4 py-2.5 text-xs text-text-muted">
                      {line.supplier}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right text-base font-bold tnum text-text">
                    {line.qty}
                  </td>
                  <td className="px-4 py-2.5">
                    <ul className="space-y-0.5">
                      {line.buyers.map((buyer) => (
                        <li key={buyer.reference} className="text-xs text-text">
                          <span className="font-bold tnum">{buyer.qty}×</span>{" "}
                          <span className="font-semibold">
                            {buyer.organisation}
                          </span>{" "}
                          <Link
                            href={`/admin/orders/${buyer.reference}`}
                            className="tnum text-navy hover:underline"
                          >
                            {buyer.reference}
                          </Link>
                        </li>
                      ))}
                      {line.buyers.length === 0 && (
                        <li className="text-xs italic text-text-subtle">
                          Not allocated to any customer order.
                        </li>
                      )}
                      {/* Said out loud rather than left as a gap in the
                          arithmetic: units bought against no order are either
                          stock we chose to hold or an allocation that never
                          happened, and the second is worth noticing. */}
                      {line.unallocated > 0 && line.buyers.length > 0 && (
                        <li className="text-xs font-semibold text-accent">
                          {line.unallocated} not allocated to anyone
                        </li>
                      )}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Summary({
  report,
  view,
}: {
  report: DemandReport;
  view: "ordered" | "despatched";
}) {
  const cards = [
    { label: "Distinct items", value: report.lines.length },
    { label: "Units", value: report.totalUnits },
    {
      label: view === "ordered" ? "Orders placed" : "Customer orders covered",
      value: report.totalOrders,
    },
  ];

  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <li
          key={card.label}
          className="rounded-card border border-border-base bg-surface p-4 shadow-card"
        >
          <p className="text-2xl font-bold tnum text-text">{card.value}</p>
          <p className="text-xs text-text-muted">{card.label}</p>
        </li>
      ))}
    </ul>
  );
}
