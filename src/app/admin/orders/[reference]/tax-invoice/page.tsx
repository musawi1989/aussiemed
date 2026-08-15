import { PrintableDoc } from "@/components/admin/PrintableDoc";
import { DocTable, SellerBlock, aed, day, loadOrderForDocs } from "@/lib/order-docs";

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
  const order = await loadOrderForDocs(reference);
  const rate = order.vatRateBasisPoints / 100;

  return (
    <PrintableDoc
      title={`Tax invoice · ${order.reference}`}
      backHref={`/admin/orders/${reference}`}
    >
      {!order.organisation?.trn && (
        <p className="mt-3 rounded-card border-l-4 border-danger bg-danger-soft px-4 py-2.5 text-sm font-bold text-danger">
          No TRN was captured for this customer, so this document is not a
          compliant UAE tax invoice — AC-03.
        </p>
      )}

      <div className="mt-4 flex flex-wrap justify-between gap-6">
        <SellerBlock />
        <div className="text-sm leading-relaxed">
          <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
            Bill to
          </p>
          <p className="font-bold text-text">
            {order.organisation?.name ?? order.user?.name ?? "Guest"}
          </p>
          <p className="text-text-muted">{order.user?.email ?? ""}</p>
          <p className="text-text-muted">
            TRN {order.organisation?.trn ?? "— not captured"}
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

      {order.invoices.map((invoice) => {
        const standard = invoice.items.filter(
          (i) => i.taxClassSnapshot !== "ZeroRated"
        );
        const zero = invoice.items.filter(
          (i) => i.taxClassSnapshot === "ZeroRated"
        );
        const standardNet = standard.reduce((n, i) => n + i.lineTotalFils, 0);
        const zeroNet = zero.reduce((n, i) => n + i.lineTotalFils, 0);

        return (
          <section key={invoice.id} className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-text">
                {invoice.supplier.companyName}
              </h2>
              <p className="text-xs tnum text-text-subtle">
                Invoice {invoice.invoiceNumber}
                {invoice.supplier.trn ? ` · TRN ${invoice.supplier.trn}` : ""}
              </p>
            </div>

            <DocTable
              head={
                <tr>
                  <th className="py-1.5">Item code</th>
                  <th className="py-1.5">Description</th>
                  <th className="py-1.5 text-right">Qty</th>
                  <th className="py-1.5 text-right">Unit price</th>
                  <th className="py-1.5 text-right">Net</th>
                  <th className="py-1.5 text-right">VAT rate</th>
                  <th className="py-1.5 text-right">VAT</th>
                </tr>
              }
            >
              {invoice.items.map((item) => (
                <tr key={item.id} className="border-b border-border-base">
                  <td className="py-2 tnum font-semibold text-text">
                    {item.skuCodeSnapshot}
                  </td>
                  <td className="py-2 text-text-muted">
                    {item.nameSnapshot}
                    <span className="block text-xs text-text-subtle">
                      {item.unitLabelSnapshot}
                      {item.batchCodeSnapshot
                        ? ` · lot ${item.batchCodeSnapshot}`
                        : ""}
                    </span>
                  </td>
                  <td className="py-2 text-right tnum text-text-muted">{item.qty}</td>
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
              ))}
            </DocTable>

            <dl className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
              <Line label={`Standard rated at ${rate}%`} value={aed(standardNet)} />
              <Line label="Zero rated" value={aed(zeroNet)} />
              <Line label="Subtotal" value={aed(invoice.subtotalFils)} />
              <Line label="VAT" value={aed(invoice.vatFils)} />
              <Line label="Invoice total" value={aed(invoice.totalFils)} strong />
            </dl>
          </section>
        );
      })}

      <dl className="mt-8 ml-auto max-w-xs space-y-1 border-t-2 border-border-strong pt-3 text-sm">
        <Line label="Order subtotal" value={aed(order.subtotalFils)} />
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
