import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintableDoc } from "@/components/PrintableDoc";
import { getSessionUser } from "@/lib/auth";
import { readCartKey } from "@/lib/cart-cookie";
import { DocTable, SellerBlock, aed, day, loadOrderForDocs } from "@/lib/order-docs";
import { dueWording, paymentDueOn } from "@/lib/payment-options";
import { sellerIdentity } from "@/lib/seller-identity";
import { addressLines, parseShippingAddress } from "@/lib/shipping-address";
import { PLACEHOLDER_NOTICE, invoiceCompliance } from "@/lib/trn";

export const metadata: Metadata = {
  title: "Order confirmation",
  description: "A printable copy of an order placed with AussieMed.",
  robots: { index: false, follow: false },
};

/**
 * The customer's own copy of their order, as a document they can keep.
 *
 * HTML AND THE BROWSER'S PRINT DIALOGUE, not a generated PDF — the same choice
 * PrintableDoc records for the three admin documents. A rendering library
 * would be a dependency whose output nobody can check without running it, and
 * "Save as PDF" is in every print dialogue on every platform a buyer is
 * likely to be using.
 *
 * IT IS NOT CALLED A TAX INVOICE, and that is the important part. The order
 * page is a summary, and AC-04 is open precisely because these documents are
 * not yet FTA-compliant. A customer-downloadable document showing a VAT
 * breakdown is the easiest thing in this application to mistake for an invoice
 * and file as one — so it says what it is, says the invoice follows, and runs
 * the same invoiceCompliance check the admin document runs. A buyer should not
 * have to take our word for it that the numbers on it are real.
 *
 * ACCESS IS THE ORDER PAGE'S RULE, REPEATED DELIBERATELY. An admin sees any
 * order, the account that placed it sees it, and a guest sees one only from
 * the cart that placed it. A missing order and a forbidden one both 404, so
 * the sequential references cannot be walked to find which exist. Written out
 * here rather than trusted from the page that links to it, because this route
 * is reachable on its own.
 */
export default async function OrderDocumentPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;

  const [order, seller, user, cartKey] = await Promise.all([
    loadOrderForDocs(reference),
    sellerIdentity(),
    getSessionUser(),
    readCartKey(),
  ]);

  const isAdmin = user?.role === "Admin";
  const isOwner = Boolean(user && order.userId === user.id);
  const isGuestWithClaim =
    !order.userId && Boolean(cartKey) && order.guestCartKey === cartKey;

  if (!isAdmin && !isOwner && !isGuestWithClaim) notFound();

  const rate = order.vatRateBasisPoints / 100;
  const shipping = parseShippingAddress(order.shippingSnapshot);
  const terms = order.organisation?.paymentTerms ?? "Prepaid";

  // The STORED due date is the one that counts: it was fixed from the terms in
  // force when the order was placed, and a later change to those terms must
  // not move a date already given. Computing one is only the fallback for an
  // order written before that column was populated.
  const due = order.paymentDueOn ?? paymentDueOn(terms, order.placedAt);
  const dueText = dueWording(
    terms,
    due.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Dubai",
    })
  );

  const tax = invoiceCompliance({
    sellerTrn: seller.trn,
    buyerTrn: order.organisation?.trn,
  });

  return (
    <PrintableDoc
      title={`Order confirmation · ${order.reference}`}
      backHref={`/orders/${reference}`}
    >
      {(!tax.compliant || tax.usesPlaceholder) && (
        <div className="mt-3 rounded-card border-l-4 border-danger bg-danger-soft px-4 py-2.5 text-sm font-bold text-danger">
          {tax.usesPlaceholder && <p>{PLACEHOLDER_NOTICE}</p>}
          <ul
            className={
              tax.usesPlaceholder
                ? "mt-1 list-disc pl-4 font-semibold"
                : "list-disc pl-4"
            }
          >
            {tax.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-between gap-6">
        <SellerBlock seller={seller} />

        <div className="text-sm leading-relaxed">
          <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
            Delivering to
          </p>
          <p className="font-bold text-text">
            {order.organisation?.name ?? order.user?.name ?? "Guest"}
          </p>
          {shipping ? (
            <address className="not-italic text-text-muted">
              {addressLines(shipping).map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
          ) : (
            <p className="text-text-muted">
              {order.deliveryType === "PickUp"
                ? "Collection from AussieMed"
                : "No delivery address recorded"}
            </p>
          )}
        </div>

        <div className="text-sm tnum leading-relaxed text-text-muted">
          {/* "Reference number", never "order number" — the wording rule the
              whole application keeps. */}
          <p>Reference {order.reference}</p>
          <p>Placed {day(order.placedAt)}</p>
          {order.poReference && <p>Your PO {order.poReference}</p>}
          <p className="mt-1 font-bold text-text">{dueText.headline}</p>
        </div>
      </div>

      <DocTable
        head={
          <tr>
            <th className="py-1.5">Item code</th>
            <th className="py-1.5">Description</th>
            <th className="py-1.5 text-right">Qty</th>
            <th className="py-1.5 text-right">Unit price</th>
            <th className="py-1.5 text-right">Net</th>
            <th className="py-1.5 text-right">VAT</th>
          </tr>
        }
      >
        {order.items.map((item) => (
          <tr key={item.id} className="border-b border-border-base">
            <td className="py-2 tnum font-semibold text-text">
              {item.skuCodeSnapshot}
            </td>
            <td className="py-2 text-text-muted">
              {item.nameSnapshot}
              <span className="block text-xs text-text-subtle">
                {item.unitLabelSnapshot}
                {item.taxClassSnapshot === "ZeroRated" ? " · zero rated" : ""}
              </span>
            </td>
            <td className="py-2 text-right tnum text-text-muted">{item.qty}</td>
            <td className="py-2 text-right tnum text-text-muted">
              {aed(item.unitPriceFils)}
            </td>
            <td className="py-2 text-right tnum text-text">
              {aed(item.lineTotalFils)}
            </td>
            <td className="py-2 text-right tnum text-text">
              {aed(item.vatFils)}
            </td>
          </tr>
        ))}
      </DocTable>

      <dl className="mt-8 ml-auto max-w-xs space-y-1 border-t-2 border-border-strong pt-3 text-sm">
        <Line label="Subtotal" value={aed(order.subtotalFils)} />
        <Line label={`VAT at ${rate}%`} value={aed(order.vatFils)} />
        {order.deliveryPriceFils > 0 && (
          <Line label="Delivery" value={aed(order.deliveryPriceFils)} />
        )}
        <Line label="Total" value={aed(order.totalFils)} strong />
      </dl>

      <div className="mt-6 space-y-2 text-xs leading-relaxed text-text-subtle">
        <p>
          <span className="font-bold text-text-muted">
            This is an order confirmation, not a tax invoice.
          </span>{" "}
          It records what you ordered and what it came to. Your tax invoice is
          issued separately when the order ships.
        </p>
        <p>{dueText.detail}</p>
        <p>
          All amounts in AED. VAT is charged at the rate in force when the order
          was placed, and zero-rated lines are marked rather than left out, so
          the two bases can be read apart.
        </p>
      </div>
    </PrintableDoc>
  );
}

function Line({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${
        strong ? "border-t border-border-base pt-1" : ""
      }`}
    >
      <dt className="text-text-muted">{label}</dt>
      <dd className={`tnum ${strong ? "font-bold text-text" : "text-text"}`}>
        {value}
      </dd>
    </div>
  );
}
