import { PrintableDoc } from "@/components/admin/PrintableDoc";
import { DocTable, day, loadOrderForDocs } from "@/lib/order-docs";

/**
 * The picking list — the warehouse's copy.
 *
 * Deliberately has no prices on it. The person walking the aisles needs the
 * item code, the quantity and somewhere to write the batch they took; money on
 * the sheet is noise, and a priced document left in a box is a mistake.
 *
 * Lines are grouped by supplier because that is how the stock is shelved, and
 * the batch column is printed empty when nothing is recorded so it can be
 * filled in by hand and typed back in afterwards.
 */
export default async function PickingListPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const order = await loadOrderForDocs(reference);

  return (
    <PrintableDoc
      title={`Picking list · ${order.reference}`}
      backHref={`/admin/orders/${reference}`}
    >
      <div className="mt-2 flex flex-wrap justify-between gap-4 text-sm text-text-muted">
        <div>
          <p>
            <span className="font-bold text-text">
              {order.organisation?.name ?? order.user?.name ?? "Guest"}
            </span>
          </p>
          <p>{order.deliveryType === "PickUp" ? "Customer collection" : "Delivery"}</p>
          {order.customerNotes && (
            <p className="mt-1 max-w-md text-text">Note: {order.customerNotes}</p>
          )}
        </div>
        <div className="text-right tnum">
          <p>Ship by {day(order.estimatedShipmentOn)}</p>
          <p>Placed {day(order.placedAt)}</p>
          <p>
            {order.invoices.reduce((n, i) => n + i.items.length, 0)} lines
          </p>
        </div>
      </div>

      {order.invoices.map((invoice) => (
        <section key={invoice.id} className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-text">
            {invoice.supplier.companyName}
          </h2>

          <DocTable
            head={
              <tr>
                <th className="py-1.5">Item code</th>
                <th className="py-1.5">Description</th>
                <th className="py-1.5">Unit</th>
                <th className="py-1.5 text-right">Qty</th>
                <th className="py-1.5">Batch / lot</th>
                <th className="py-1.5">Expiry</th>
                <th className="py-1.5">Picked</th>
              </tr>
            }
          >
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-b border-border-base">
                <td className="py-2 tnum font-semibold text-text">
                  {item.skuCodeSnapshot}
                </td>
                <td className="py-2 text-text-muted">{item.nameSnapshot}</td>
                <td className="py-2 text-text-muted">{item.unitLabelSnapshot}</td>
                <td className="py-2 text-right tnum font-bold text-text">
                  {item.qty}
                </td>
                <td className="py-2 tnum text-text-muted">
                  {item.batchCodeSnapshot ?? (
                    <span className="inline-block min-w-[6rem] border-b border-dashed border-border-strong">
                      &nbsp;
                    </span>
                  )}
                </td>
                <td className="py-2 tnum text-text-muted">
                  {item.expiresOnSnapshot ? (
                    day(item.expiresOnSnapshot)
                  ) : (
                    <span className="inline-block min-w-[5rem] border-b border-dashed border-border-strong">
                      &nbsp;
                    </span>
                  )}
                </td>
                <td className="py-2">
                  <span className="inline-block h-4 w-4 border border-border-strong" />
                </td>
              </tr>
            ))}
          </DocTable>
        </section>
      ))}

      <p className="mt-8 text-xs leading-relaxed text-text-subtle">
        No prices appear on this document by design. Record the batch and expiry
        of what was actually picked — a recall is traced from these numbers.
      </p>

      <div className="mt-8 flex gap-12 text-sm">
        <div>
          <p className="text-text-muted">Picked by</p>
          <p className="mt-6 w-48 border-t border-border-strong" />
        </div>
        <div>
          <p className="text-text-muted">Checked by</p>
          <p className="mt-6 w-48 border-t border-border-strong" />
        </div>
      </div>
    </PrintableDoc>
  );
}
