import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { formatAED } from "@/lib/money";
import { myInvoiceMonths } from "@/lib/supplier-invoices";

const aed = (fils: number) => formatAED(fils / 100);

/**
 * A supplier's invoices, one per calendar month.
 *
 * SELF-BILLED. They do not send us one and we do not key one in: the site
 * compiles it from goods-in, so the figure cannot disagree with what we
 * received. The page says so, because a supplier expecting to raise their own
 * invoice needs telling once that they do not have to.
 *
 * Only months with receipts appear. An empty month is not an invoice, and a
 * row reading zero is a row somebody has to work out the meaning of.
 */
export default async function SupplierInvoicesPage() {
  const invoices = await myInvoiceMonths();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-text">
        Your invoices
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        One per calendar month, compiled by us from what actually arrived at our
        sorting facility &mdash; you do not need to raise one. A month covers
        the first to the last of the month, and each line is priced at the
        quantity we received rather than the quantity ordered.
      </p>

      {invoices.length === 0 ? (
        <p className="mt-6 rounded-card border border-border-base bg-surface px-4 py-12 text-center text-sm text-text-muted shadow-card">
          Nothing yet. An invoice appears here for each month in which one of
          your orders is received in full.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-card border border-border-base bg-surface shadow-card">
          <table className="w-full min-w-[38rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-base text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2 text-right">Orders</th>
                <th className="px-3 py-2 text-right">Lines</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2 text-right">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice.month}
                  className="relative border-b border-border-base transition-colors last:border-0 hover:bg-navy-soft/40"
                >
                  <td className="px-3 py-2 font-semibold text-text">
                    <Link
                      href={`/business-portal/invoices/${invoice.month}`}
                      className="text-navy after:absolute after:inset-0 after:content-[''] hover:underline"
                    >
                      {invoice.label}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tnum text-text-muted">
                    {invoice.orderCount}
                  </td>
                  <td className="px-3 py-2 text-right tnum text-text-muted">
                    {invoice.lines.length}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tnum text-text">
                    {/* Never a zero standing in for a missing price. */}
                    {invoice.totalFils === null ? "—" : aed(invoice.totalFils)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill
                      axis="payment"
                      status={invoice.paymentStatus}
                      size="small"
                    />
                  </td>
                  <td className="relative z-10 px-3 py-2 text-right">
                    <Link
                      href={`/business-portal/invoices/${invoice.month}`}
                      className="text-xs font-bold text-navy hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
