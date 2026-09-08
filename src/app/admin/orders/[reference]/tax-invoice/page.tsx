import { ProductThumbnail } from "@/components/ProductThumbnail";
import { PrintableDoc } from "@/components/PrintableDoc";
import { sellerIdentity } from "@/lib/seller-identity";
import { PLACEHOLDER_NOTICE, formatTrn, invoiceCompliance } from "@/lib/trn";
import { DocTable, SellerBlock, aed, day, loadOrderForDocs } from "@/lib/order-docs";
import {
  discountLabel,
  lineDiscount,
  orderDiscount,
  sourceLabel,
} from "@/lib/order-discounts";

/**
 * The tax invoice — one per supplier, as the order is actually split.
 *
 * Zero-rated lines are shown at 0% rather than left out of the VAT column, and
 * the two bases are subtotalled separately. On a UAE tax invoice the split
 * between standard-rated and zero-rated supply is the part an auditor reads,
 * and a single VAT figure hides it.
 *
 * What is still missing is stated on the document rather than quietly omitted:
 * without the seller's TRN and the buyer's, this is not a compliant tax
 * invoice, and printing one that looks compliant is worse than printing one
 * that admits it is not.
 */
export default async function TaxInvoicePage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const [order, seller] = await Promise.all([
    loadOrderForDocs(reference),
    sellerIdentity(),
  ]);
  const rate = order.vatRateBasisPoints / 100;

  const tax = invoiceCompliance({
    sellerTrn: seller.trn,
    buyerTrn: order.organisation?.trn,
  });

  // The two bases, shown separately so a reader can check the VAT against the
  // standard-rated portion rather than against the whole invoice.
  const standardNet = order.items
    .filter((i) => i.taxClassSnapshot !== "ZeroRated")
    .reduce((n, i) => n + i.lineTotalFils, 0);
  const zeroNet = order.items
    .filter((i) => i.taxClassSnapshot === "ZeroRated")
    .reduce((n, i) => n + i.lineTotalFils, 0);

  /*
   * What this account's terms took off, as recorded when the order was placed.
   *
   * Read from the snapshot on each line, never recomputed from today's prices:
   * an invoice already sent must say the same thing next year, and a customer
   * may have quoted this saving in a tender. Orders placed before the snapshot
   * existed report nothing at all rather than a figure worked out from prices
   * that have since moved.
   */
  const saved = orderDiscount(order.items);

  return (
    <PrintableDoc
      title={`Tax invoice · ${order.reference}`}
      backHref={`/admin/orders/${reference}`}
    >
      {/* Every reason this is not yet a compliant document, from both sides.
          It listed only the customer's missing TRN, so once a customer had one
          the document fell silent regardless of AussieMed's own position. */}
      {(!tax.compliant || tax.usesPlaceholder) && (
        <div className="mt-3 rounded-card border-l-4 border-danger bg-danger-soft px-4 py-2.5 text-sm font-bold text-danger">
          {tax.usesPlaceholder && <p>{PLACEHOLDER_NOTICE}</p>}
          <ul className={tax.usesPlaceholder ? "mt-1 list-disc pl-4 font-semibold" : "list-disc pl-4"}>
            {tax.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
            {!order.organisation?.trn && (
              <li>No TRN was captured for this customer — AC-03.</li>
            )}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-between gap-6">
        <SellerBlock seller={seller} />
        <div className="text-sm leading-relaxed">
          <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
            Bill to
          </p>
          <p className="font-bold text-text">
            {order.organisation?.name ?? order.user?.name ?? "Guest"}
          </p>
          <p className="text-text-muted">{order.user?.email ?? ""}</p>
          <p className="text-text-muted">
            TRN {formatTrn(order.organisation?.trn) ?? "— not captured"}
          </p>
          <p className="text-text-muted">
            Terms {order.organisation?.paymentTerms ?? "—"}
          </p>
        </div>
        <div className="text-sm tnum leading-relaxed text-text-muted">
          <p>Order {order.reference}</p>
          <p>Placed {day(order.placedAt)}</p>
          <p>Due {day(order.paymentDueOn)}</p>
          {order.poReference && <p>PO {order.poReference}</p>}
        </div>
      </div>

      {/* One invoice, from AussieMed.
       *
       * This used to be a section per supplier, each with its own invoice
       * number and the supplier's TRN — which was the marketplace model. Under
       * DEC-22 AussieMed is the seller of record, so there is one document
       * with one TRN on it, and under DEC-24 the customer never learns which
       * companies the goods were bought from.
       */}
      <section className="mt-8">
            <DocTable
              head={
                <tr>
                  <th className="py-1.5">Item code</th>
                  <th className="py-1.5">Description</th>
                  <th className="py-1.5 text-right">Qty</th>
                  {/* Only when there is something to put in it. An empty
                      column on every list-priced invoice is furniture. */}
                  {saved.discounted && (
                    <th className="py-1.5 text-right">List price</th>
                  )}
                  <th className="py-1.5 text-right">Unit price</th>
                  <th className="py-1.5 text-right">Net</th>
                  <th className="py-1.5 text-right">VAT rate</th>
                  <th className="py-1.5 text-right">VAT</th>
                </tr>
              }
            >
              {order.items.map((item) => {
                const off = lineDiscount(item);
                const note = discountLabel(off, order.accountDiscountBasisPoints);
                return (
                <tr key={item.id} className="border-b border-border-base">
                  <td className="py-2 tnum font-semibold text-text">
                    <ProductThumbnail skuCode={item.skuCodeSnapshot} />{item.skuCodeSnapshot}
                  </td>
                  <td className="py-2 text-text-muted">
                    {item.nameSnapshot}
                    <span className="block text-xs text-text-subtle">
                      {item.unitLabelSnapshot}
                      {item.batchCodeSnapshot
                        ? ` · lot ${item.batchCodeSnapshot}`
                        : ""}
                      {/* Why this line is below list, in words, beside the
                          figures that show it. */}
                      {note ? ` · ${note}` : ""}
                    </span>
                  </td>
                  <td className="py-2 text-right tnum text-text-muted">{item.qty}</td>
                  {saved.discounted && (
                    <td className="py-2 text-right tnum text-text-subtle">
                      {off.listUnitPriceFils === null
                        ? "—"
                        : off.discounted
                          ? aed(off.listUnitPriceFils)
                          : ""}
                    </td>
                  )}
                  <td className="py-2 text-right tnum text-text-muted">
                    {aed(item.unitPriceFils)}
                  </td>
                  <td className="py-2 text-right tnum text-text">
                    {aed(item.lineTotalFils)}
                  </td>
                  <td className="py-2 text-right tnum text-text-muted">
                    {item.taxClassSnapshot === "ZeroRated" ? "0%" : `${rate}%`}
                  </td>
                  <td className="py-2 text-right tnum text-text">
                    {aed(item.vatFils)}
                  </td>
                </tr>
                );
              })}
            </DocTable>

      </section>

      <dl className="mt-8 ml-auto max-w-xs space-y-1 border-t-2 border-border-strong pt-3 text-sm">
        {/* The discount stated before the subtotal it produced, so the
            reader can follow the arithmetic rather than take the net figure
            on trust. */}
        {saved.discounted && saved.listSubtotalFils !== null && (
          <Line label="Subtotal at list" value={aed(saved.listSubtotalFils)} />
        )}
        {saved.sources.map((source) =>
          saved.savingBySource[source] > 0 ? (
            <Line
              key={source}
              label={sourceLabel(
                source,
                // The rate the account was on when the order was placed, not
                // what it is on today.
                source === "AccountDiscount"
                  ? order.accountDiscountBasisPoints
                  : undefined
              )}
              value={`−${aed(saved.savingBySource[source])}`}
            />
          ) : null
        )}
        <Line label={`Standard rated at ${rate}%`} value={aed(standardNet)} />
        <Line label="Zero rated" value={aed(zeroNet)} />
        <Line label="Subtotal" value={aed(order.subtotalFils)} />
        <Line label={`VAT at ${rate}%`} value={aed(order.vatFils)} />
        <Line label="Delivery" value={aed(order.deliveryPriceFils)} />
        <Line label="Total due" value={aed(order.totalFils)} strong />
        <Line label="Received" value={aed(order.paidFils)} />
        <Line
          label="Outstanding"
          value={aed(Math.max(0, order.totalFils - order.paidFils))}
          strong
        />
      </dl>

      <p className="mt-6 text-xs leading-relaxed text-text-subtle">
        All amounts in AED. VAT is charged at the rate in force when the order
        was placed. Zero-rated lines are shown at 0% rather than omitted, so the
        two bases can be read separately — the classification itself is still
        awaiting confirmation under AC-02.
      </p>
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
