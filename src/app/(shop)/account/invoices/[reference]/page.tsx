import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/account/PrintButton";
import { StatusPill } from "@/components/StatusPill";
import { invoiceForAccount } from "@/lib/account-reports";
import { formatAED } from "@/lib/money";
import { addressLines, parseShippingAddress } from "@/lib/shipping-address";
import { deliveryStatusOf, paymentStatusOf, statusMeaning } from "@/lib/status-tone";
import { sellerIdentity } from "@/lib/seller-identity";
import { PLACEHOLDER_NOTICE, formatTrn, invoiceCompliance } from "@/lib/trn";

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
 * The customer's own invoice.
 *
 * This is what "download my invoice" means in a build with no PDF generator: a
 * page any browser will save as one. That was always the plan — what was
 * missing was the other half of it. The project had no print stylesheet at
 * all, so this printed as a screenshot of a web page: screen margins, the
 * browser's URL header, backgrounds dropped, and a customer in dark mode
 * getting white text on navy. The rules now live in globals.css under
 * "Paper"; this file is laid out to suit them.
 *
 * The layout follows what a finance clerk actually does with an invoice, in
 * order: what is this and who is it from, what do I owe, by when, what for,
 * and how do I pay. The amount due is therefore the largest thing on the page
 * — not the company name, which nobody has ever needed to find quickly.
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
  const [invoice, seller] = await Promise.all([
    invoiceForAccount(reference),
    sellerIdentity(),
  ]);
  if (!invoice) notFound();

  const shipping = parseShippingAddress(invoice.shippingSnapshot);
  const rate = invoice.vatRateBasisPoints / 100;

  const standardNet = invoice.items
    .filter((i) => i.taxClassSnapshot !== "ZeroRated")
    .reduce((n, i) => n + i.lineTotalFils, 0);
  const zeroNet = invoice.items
    .filter((i) => i.taxClassSnapshot === "ZeroRated")
    .reduce((n, i) => n + i.lineTotalFils, 0);

  // Payment is worked out rather than read, so an invoice that fell due
  // yesterday says so the moment it is opened. Nothing rewrites the column at
  // midnight, and a nightly job to do it is a job to forget.
  const payment = paymentStatusOf(invoice, new Date());
  const delivery = deliveryStatusOf(invoice);

  // A refunded or cancelled order owes nothing, whatever the arithmetic on the
  // columns says. Without this an order that was cancelled and refunded would
  // head its own invoice "Amount due" — which is both wrong and alarming to
  // receive.
  const closed = payment === "Refunded" || invoice.status === "Cancelled";
  const outstanding = closed
    ? 0
    : Math.max(0, invoice.totalFils - invoice.paidFils);
  const settled = outstanding === 0;

  // Both sides. Read from the customer's TRN alone, this called itself a tax
  // invoice the moment a customer was registered, whatever AussieMed's own
  // position was — and this document can be emailed out.
  const tax = invoiceCompliance({
    sellerTrn: seller.trn,
    buyerTrn: invoice.organisation?.trn,
  });
  const compliant = tax.compliant;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/account/reports"
          className="text-sm font-semibold text-text-muted hover:text-navy"
        >
          &larr; Spending
        </Link>
        <PrintButton />
      </div>

      {/* print-document: on paper this article is the only thing that exists.
          See the "Paper" block in globals.css. */}
      <article className="print-document mt-5 rounded-card border border-border-base bg-surface p-8 shadow-card print-flat print:mt-0">
        {/* Loud, and at the top. The failure being guarded against is somebody
            emailing a test invoice to a real customer and neither of them
            noticing — a warning in the small print would not stop that. */}
        {tax.usesPlaceholder && (
          <p className="mb-5 rounded-card border-2 border-danger bg-danger-soft px-4 py-2.5 text-sm font-bold text-danger print-tone">
            {PLACEHOLDER_NOTICE}
          </p>
        )}

        {/* ---------------------------------------------------------- *
         * Who it is from, and what it is
         * ---------------------------------------------------------- */}
        <header className="flex flex-wrap items-start justify-between gap-8 avoid-break">
          <div>
            <p className="text-xl font-bold tracking-tight text-navy">AussieMed</p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              Medical, dental and laboratory supplies
              <br />
              {seller.address}
              <br />
              info@aussiemed.com
              <br />
              <span className="tnum">TRN {formatTrn(seller.trn)}</span>
            </p>
          </div>

          <div className="text-right">
            {/* The document type, said plainly. A reader filing this needs to
                know in one glance whether it is an invoice or a quote. */}
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-text-subtle">
              {compliant ? "Tax invoice" : "Statement of charges"}
            </p>
            <p className="mt-0.5 text-2xl font-bold tnum leading-none text-text">
              {invoice.reference}
            </p>

            <dl className="mt-3 space-y-0.5 text-xs tnum text-text-muted">
              <Meta label="Issued" value={day(invoice.placedAt)} />
              {invoice.paymentDueOn && (
                <Meta label="Due" value={day(invoice.paymentDueOn)} />
              )}
              {invoice.poReference && (
                <Meta label="Your PO" value={invoice.poReference} />
              )}
            </dl>
          </div>
        </header>

        {/* ---------------------------------------------------------- *
         * What is owed — the thing the reader came for
         * ---------------------------------------------------------- */}
        <section className="mt-6 flex flex-wrap items-end justify-between gap-4 rounded-card border border-border-strong bg-surface-sunken px-5 py-4 avoid-break print:bg-transparent">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
              {closed
                ? invoice.status === "Cancelled"
                  ? "Cancelled, nothing owed"
                  : "Refunded in full"
                : settled
                  ? "Total, paid in full"
                  : "Amount due"}
            </p>
            <p className="mt-0.5 text-3xl font-bold tnum leading-none text-text">
              {aed(settled ? invoice.totalFils : outstanding)}
            </p>
            {!settled && invoice.paidFils > 0 && (
              <p className="mt-1 text-xs tnum text-text-muted">
                {aed(invoice.totalFils)} invoiced, {aed(invoice.paidFils)}{" "}
                received
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={payment} axis="payment" />
            <StatusPill status={delivery} axis="delivery" />
          </div>
        </section>

        {/* ---------------------------------------------------------- *
         * Who it is to, and where the goods went
         * ---------------------------------------------------------- */}
        <section className="mt-6 grid gap-6 sm:grid-cols-2 avoid-break">
          <div>
            <Caption>Billed to</Caption>
            <p className="mt-1 font-bold text-text">
              {invoice.organisation?.name ?? ""}
            </p>
            <p className="text-sm tnum text-text-muted">
              TRN {formatTrn(invoice.organisation?.trn) ?? "not on file"}
            </p>
            {(invoice.staff?.name ?? invoice.placedByName) && (
              <p className="text-sm text-text-muted">
                Ordered by {invoice.staff?.name ?? invoice.placedByName}
              </p>
            )}
          </div>

          {shipping && (
            <div>
              <Caption>
                {invoice.deliveryType === "PickUp" ? "Collected from" : "Delivered to"}
              </Caption>
              <address className="mt-1 not-italic text-sm leading-relaxed text-text-muted">
                {addressLines(shipping).map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
              {invoice.courier && (
                <p className="mt-1 text-sm tnum text-text-muted">
                  {invoice.courier}
                  {invoice.trackingNumber ? ` · ${invoice.trackingNumber}` : ""}
                </p>
              )}
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------- *
         * What it is for
         * ---------------------------------------------------------- */}
        <div className="mt-7 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm [&_td]:align-top">
            <thead>
              <tr className="border-y border-border-strong text-left text-[0.6875rem] uppercase tracking-wide text-text-subtle">
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
                  className="border-b border-border-base"
                >
                  <td className="py-2 pr-3 text-text">
                    {item.nameSnapshot}
                    <span className="block text-xs tnum text-text-subtle">
                      {item.skuCodeSnapshot} &middot; {item.unitLabelSnapshot}
                      {item.taxClassSnapshot === "ZeroRated" && (
                        <span className="ml-1.5 font-bold text-success">
                          zero rated
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right tnum text-text">
                    {item.qty}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right tnum text-text-muted">
                    {aed(item.unitPriceFils)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right tnum text-text-muted">
                    {aed(item.vatFils)}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right font-bold tnum text-text">
                    {aed(item.lineTotalFils)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* The two bases separately: on a UAE tax invoice that split is the
            part an auditor reads, and one VAT figure hides it. */}
        <dl className="mt-5 ml-auto w-full max-w-xs space-y-1 text-sm avoid-break">
          <Line label="Standard rated" value={aed(standardNet)} />
          <Line label="Zero rated" value={aed(zeroNet)} />
          <Line label={`VAT at ${rate}%`} value={aed(invoice.vatFils)} />
          <Line label="Invoice total" value={aed(invoice.totalFils)} rule bold />
          {invoice.paidFils > 0 && (
            <Line label="Received" value={`− ${aed(invoice.paidFils)}`} />
          )}
          {!settled && (
            <Line label="Balance due" value={aed(outstanding)} rule bold big />
          )}
        </dl>

        {/* ---------------------------------------------------------- *
         * How to pay, and the small print
         * ---------------------------------------------------------- */}
        <footer className="mt-8 border-t border-border-strong pt-4 avoid-break">
          {!settled && (
            <p className="text-sm text-text">
              <span className="font-bold">
                {statusMeaning("payment", payment).label}.
              </span>{" "}
              {invoice.paymentDueOn
                ? `Payable by ${day(invoice.paymentDueOn)}. `
                : ""}
              Please quote <span className="tnum font-bold">{invoice.reference}</span>{" "}
              with your remittance.
            </p>
          )}

          {!compliant && (
            <div className="mt-3 border-l-[3px] border-accent-border bg-accent-soft px-3 py-2 text-xs leading-relaxed text-text print:bg-transparent">
              <p>
                This is a record of what you were charged rather than a
                compliant UAE tax invoice.
              </p>
              <ul className="mt-1 list-disc pl-4">
                {tax.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
                {!invoice.organisation?.trn && (
                  <li>
                    We do not hold a TRN for your account. Send yours to
                    info@aussiemed.com and we will reissue it.
                  </li>
                )}
              </ul>
            </div>
          )}

          <p className="mt-3 text-[0.6875rem] leading-relaxed text-text-subtle">
            All amounts in AED. The VAT rate shown is the one in force when the
            order was placed, so a later change cannot alter this document.
          </p>
        </footer>
      </article>
    </div>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-text-subtle">
      {children}
    </p>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-end gap-3">
      <dt className="text-text-subtle">{label}</dt>
      <dd className="font-semibold text-text">{value}</dd>
    </div>
  );
}

function Line({
  label,
  value,
  bold = false,
  big = false,
  rule = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  big?: boolean;
  rule?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-6 ${
        rule ? "mt-1 border-t border-border-strong pt-1.5" : ""
      }`}
    >
      <dt className={bold ? "font-bold text-text" : "text-text-muted"}>{label}</dt>
      <dd
        className={`tnum whitespace-nowrap ${
          big ? "text-lg font-bold text-text" : bold ? "font-bold text-text" : "text-text"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
