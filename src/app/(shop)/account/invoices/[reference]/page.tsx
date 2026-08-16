import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/account/PrintButton";
import { invoiceForAccount } from "@/lib/account-reports";
import { formatAED } from "@/lib/money";
import { addressLines, parseShippingAddress } from "@/lib/shipping-address";

export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
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
 * The customer's own invoice, laid out to be printed.
 *
 * This is what "download my invoice" means in a build with no PDF generator:
 * a page any browser will save as one, with the chrome removed on paper. That
 * is honest, and it is also what the admin documents already do.
 *
 * It carries no supplier and no cost. Not by filtering them out — the query
 * behind it never reads them.
 */
export default async function AccountInvoicePage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const invoice = await invoiceForAccount(reference);
  if (!invoice) notFound();

  const shipping = parseShippingAddress(invoice.shippingSnapshot);
  const rate = invoice.vatRateBasisPoints / 100;

  const standardNet = invoice.items
    .filter((i) => i.taxClassSnapshot !== "ZeroRated")
    .reduce((n, i) => n + i.lineTotalFils, 0);
  const zeroNet = invoice.items
    .filter((i) => i.taxClassSnapshot === "ZeroRated")
    .reduce((n, i) => n + i.lineTotalFils, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/account/reports"
          className="text-sm font-semibold text-text-muted hover:text-navy"
        >
          &larr; Spending
        </Link>
        <PrintButton />
      </div>

      <div className="mt-5 rounded-card border border-border-base bg-surface p-6 shadow-card print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-border-base pb-5">
          <div>
            <p className="text-lg font-bold tracking-tight text-navy">AussieMed</p>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              Medical, dental and laboratory supplies
              <br />
              info@aussiemed.com
            </p>
          </div>

          <div className="text-right text-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
              Invoice
            </p>
            {/* "Reference number" everywhere, never "order number". */}
            <p className="text-xl font-bold tnum text-text">{invoice.reference}</p>
            <p className="mt-1 tnum text-text-muted">{day(invoice.placedAt)}</p>
            {invoice.poReference && (
              <p className="tnum text-text-muted">Your PO {invoice.poReference}</p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-between gap-6 text-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
              Billed to
            </p>
            <p className="mt-1 font-bold text-text">
              {invoice.organisation?.name ?? ""}
            </p>
            <p className="text-text-muted">
              TRN {invoice.organisation?.trn ?? "not on file"}
            </p>
            {invoice.staff?.name || invoice.placedByName ? (
              <p className="text-text-muted">
                Ordered by {invoice.staff?.name ?? invoice.placedByName}
              </p>
            ) : null}
          </div>

          {shipping && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
                Delivered to
              </p>
              <address className="mt-1 not-italic leading-relaxed text-text-muted">
                {addressLines(shipping).map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
            </div>
          )}
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-strong text-left text-xs uppercase tracking-wide text-text-subtle">
                <th className="py-2 pr-3 font-bold">Item</th>
                <th className="py-2 pr-3 text-right font-bold">Qty</th>
                <th className="py-2 pr-3 text-right font-bold">Unit</th>
                <th className="py-2 pr-3 text-right font-bold">VAT</th>
                <th className="py-2 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr
                  key={item.skuCodeSnapshot + item.nameSnapshot}
                  className="border-b border-border-base last:border-0"
                >
                  <td className="py-2 pr-3 text-text">
                    {item.nameSnapshot}
                    <span className="block text-xs text-text-subtle tnum">
                      {item.skuCodeSnapshot} &middot; {item.unitLabelSnapshot}
                      {item.taxClassSnapshot === "ZeroRated" && (
                        <span className="ml-1.5 font-bold text-success">
                          zero rated
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tnum text-text">{item.qty}</td>
                  <td className="py-2 pr-3 text-right tnum text-text-muted">
                    {aed(item.unitPriceFils)}
                  </td>
                  <td className="py-2 pr-3 text-right tnum text-text-muted">
                    {aed(item.vatFils)}
                  </td>
                  <td className="py-2 text-right font-bold tnum text-text">
                    {aed(item.lineTotalFils)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* The two bases separately: on a UAE tax invoice that split is the
            part an auditor reads, and one VAT figure hides it. */}
        <dl className="mt-5 ml-auto max-w-xs space-y-1.5 text-sm">
          <Line label="Standard rated" value={aed(standardNet)} />
          <Line label="Zero rated" value={aed(zeroNet)} />
          <Line label={`VAT at ${rate}%`} value={aed(invoice.vatFils)} />
          <Line label="Total" value={aed(invoice.totalFils)} bold />
        </dl>

        {!invoice.organisation?.trn && (
          <p className="mt-5 rounded-card border-l-4 border-accent-border bg-accent-soft px-4 py-2.5 text-sm text-text print:border print:border-border-strong">
            We do not hold a TRN for your account, so this is a record of what
            you were charged rather than a compliant UAE tax invoice. Send your
            TRN to info@aussiemed.com and we will reissue it.
          </p>
        )}

        <p className="mt-5 border-t border-border-base pt-4 text-xs leading-relaxed text-text-subtle">
          All amounts in AED. The VAT rate shown is the one in force when the
          order was placed, so a later change cannot alter this document.
          Payment status: {invoice.paymentStatus.toLowerCase()}.
        </p>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-6 ${
        bold ? "border-t border-border-strong pt-1.5" : ""
      }`}
    >
      <dt className={bold ? "font-bold text-text" : "text-text-muted"}>{label}</dt>
      <dd className={`tnum ${bold ? "text-lg font-bold text-text" : "text-text"}`}>
        {value}
      </dd>
    </div>
  );
}
