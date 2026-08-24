import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintableDoc } from "@/components/PrintableDoc";
import { StatusPill } from "@/components/StatusPill";
import { formatAED } from "@/lib/money";
import { myInvoice } from "@/lib/supplier-invoices";

const aed = (fils: number) => formatAED(fils / 100);
const day = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
/** The stored end is the first instant of the NEXT month, so the last day
    billed is one millisecond back — never a date the supplier would read as
    a day they were not billed for. */
const lastDay = (to: Date) => day(new Date(to.getTime() - 1));

export default async function SupplierInvoicePage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const { month } = await params;
  const invoice = await myInvoice(month);

  // Null covers both a month that is not a month and one with nothing in it.
  // Neither is an invoice, and both are the same 404 to whoever typed the URL.
  if (!invoice || invoice.orderCount === 0) notFound();

  return (
    <PrintableDoc
      title={`Invoice — ${invoice.label}`}
      backHref="/business-portal/invoices"
      backLabel="Back to your invoices"
      downloadHref={`/business-portal/invoices/${invoice.month}/pdf`}
    >
      <div className="mt-4 flex flex-wrap items-center gap-3 print:hidden">
        <StatusPill axis="payment" status={invoice.paymentStatus} />
        <span className="text-sm text-text-muted">
          {invoice.paymentStatus === "Paid"
            ? "Settled in full."
            : "We settle each month's invoice after it closes."}
        </span>
      </div>

      <div className="mt-5 grid gap-4 rounded-card border border-border-base bg-surface p-4 text-sm shadow-card sm:grid-cols-3 print:shadow-none">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
            Period
          </p>
          <p className="mt-1 font-semibold text-text">{invoice.label}</p>
          <p className="text-xs text-text-muted">
            {day(invoice.from)} &ndash;{" "}
            {lastDay(invoice.to)}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
            Orders received
          </p>
          <p className="mt-1 font-semibold tnum text-text">
            {invoice.orderCount}
          </p>
          <p className="text-xs text-text-muted">
            {invoice.lines.length} line{invoice.lines.length === 1 ? "" : "s"}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
            Total
          </p>
          <p className="mt-1 text-lg font-bold tnum text-text">
            {invoice.totalFils === null ? "—" : aed(invoice.totalFils)}
          </p>
          {invoice.paidFils > 0 && (
            <p className="text-xs text-text-muted">
              {aed(invoice.paidFils)} received
            </p>
          )}
        </div>
      </div>

      {invoice.uncostedLines > 0 && (
        /* Said on the paper, not just on screen. A total that silently omitted
           priced-at-nothing lines would be a figure both sides think is the
           whole amount. */
        <p className="mt-4 rounded-card border border-attention-border bg-attention-soft px-3 py-2 text-xs font-semibold text-attention-text">
          {invoice.uncostedLines} line
          {invoice.uncostedLines === 1 ? " has" : "s have"} no agreed unit cost
          on our record, so no total can be shown. Contact us and we will settle
          the price before payment.
        </p>
      )}

      <div className="mt-5 overflow-x-auto rounded-card border border-border-base bg-surface shadow-card print:shadow-none">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-base text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
              <th className="px-3 py-2">PO</th>
              <th className="px-3 py-2">Received</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Unit</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, index) => (
              <tr
                key={`${line.poNumber}-${line.code}-${index}`}
                className="border-b border-border-base last:border-0"
              >
                <td className="px-3 py-2 font-semibold text-text">
                  {line.poNumber}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-text-muted">
                  {line.receivedAt ? day(line.receivedAt) : "—"}
                </td>
                <td className="px-3 py-2 tnum text-text-muted">{line.code}</td>
                <td className="px-3 py-2 text-text">{line.name}</td>
                <td className="px-3 py-2 text-right tnum text-text">
                  {line.qtyReceived}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tnum text-text-muted">
                  {line.unitCostFils === null ? "—" : aed(line.unitCostFils)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-bold tnum text-text">
                  {line.lineTotalFils === null ? "—" : aed(line.lineTotalFils)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border-strong">
              <td colSpan={6} className="px-3 py-2 text-right font-bold text-text">
                Total
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-base font-bold tnum text-text">
                {invoice.totalFils === null ? "—" : aed(invoice.totalFils)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-text-subtle">
        Compiled by AussieMed from goods received between{" "}
        {day(invoice.from)} and{" "}
        {lastDay(invoice.to)}. Quantities are what
        we booked in, not what was ordered. If a figure here does not match your
        records, tell us before the month is paid.{" "}
        <Link
          href="/business-portal"
          className="font-semibold text-navy hover:underline print:hidden"
        >
          Your purchase orders
        </Link>
      </p>
    </PrintableDoc>
  );
}
