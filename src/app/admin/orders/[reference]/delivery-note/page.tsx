import { PrintableDoc } from "@/components/admin/PrintableDoc";
import { DocTable, SellerBlock, day, loadOrderForDocs } from "@/lib/order-docs";

/**
 * The delivery note — the copy that travels with the goods.
 *
 * Also priceless, for a different reason from the picking list: the person
 * receiving the delivery is often not the person who buys, and a ward clerk
 * should not be handed the commercial terms. What they do need is exactly what
 * is in the box, with the batch and expiry of each line, so goods-in can check
 * it against their own records.
 */
export default async function DeliveryNotePage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const order = await loadOrderForDocs(reference);

  const items = order.invoices.flatMap((invoice) =>
    invoice.items.map((item) => ({ item, supplier: invoice.supplier.companyName }))
  );
  // Cancelled lines are not in the box, so they are not on the note.
  const shipped = items.filter(({ item }) => item.status !== "Cancelled");
  const held = items.filter(({ item }) => item.status === "Backordered");

  return (
    <PrintableDoc
      title={`Delivery note · ${order.reference}`}
      backHref={`/admin/orders/${reference}`}
    >
      <div className="mt-3 flex flex-wrap justify-between gap-6">
        <SellerBlock />
        <div className="text-sm leading-relaxed">
          <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
            Deliver to
          </p>
          <p className="font-bold text-text">
            {order.organisation?.name ?? order.user?.name ?? "Guest"}
          </p>
          {order.shippingSnapshot ? (
            <p className="whitespace-pre-line text-text-muted">
              {order.shippingSnapshot}
            </p>
          ) : (
            <p className="text-text-muted">
              {order.deliveryType === "PickUp"
                ? "Collection from AussieMed"
                : "No delivery address recorded"}
            </p>
          )}
          <p className="mt-1 text-text-muted">{order.user?.phone ?? ""}</p>
        </div>
        <div className="text-sm tnum leading-relaxed text-text-muted">
          <p>Order {order.reference}</p>
          <p>Placed {day(order.placedAt)}</p>
          <p>Ship by {day(order.estimatedShipmentOn)}</p>
          {order.courier && <p>Courier {order.courier}</p>}
          {order.trackingNumber && <p>Tracking {order.trackingNumber}</p>}
          {order.poReference && <p>PO {order.poReference}</p>}
        </div>
      </div>

      <DocTable
        head={
          <tr>
            <th className="py-1.5">Item code</th>
            <th className="py-1.5">Description</th>
            <th className="py-1.5">Unit</th>
            <th className="py-1.5">Batch / lot</th>
            <th className="py-1.5">Expiry</th>
            <th className="py-1.5 text-right">Qty</th>
          </tr>
        }
      >
        {shipped.map(({ item }) => (
          <tr key={item.id} className="border-b border-border-base">
            <td className="py-2 tnum font-semibold text-text">
              {item.skuCodeSnapshot}
            </td>
            <td className="py-2 text-text-muted">{item.nameSnapshot}</td>
            <td className="py-2 text-text-muted">{item.unitLabelSnapshot}</td>
            <td className="py-2 tnum text-text-muted">
              {item.batchCodeSnapshot ?? "—"}
            </td>
            <td className="py-2 tnum text-text-muted">
              {day(item.expiresOnSnapshot)}
            </td>
            <td className="py-2 text-right tnum font-bold text-text">{item.qty}</td>
          </tr>
        ))}
      </DocTable>

      {held.length > 0 && (
        <p className="mt-4 rounded-card bg-accent-soft px-3 py-2 text-sm text-text">
          <span className="font-bold">To follow:</span>{" "}
          {held.map(({ item }) => `${item.skuCodeSnapshot} × ${item.qty}`).join(", ")}
          . These lines are on backorder and are not in this delivery.
        </p>
      )}

      {order.customerNotes && (
        <p className="mt-4 text-sm text-text">
          <span className="font-bold">Delivery instruction:</span>{" "}
          {order.customerNotes}
        </p>
      )}

      <p className="mt-6 text-xs leading-relaxed text-text-subtle">
        No prices appear on this document. Please check the goods against this
        note on receipt and report any discrepancy within 48 hours, quoting the
        order number above.
      </p>

      <div className="mt-8 flex flex-wrap gap-12 text-sm">
        <div>
          <p className="text-text-muted">Received by (print name)</p>
          <p className="mt-6 w-56 border-t border-border-strong" />
        </div>
        <div>
          <p className="text-text-muted">Signature</p>
          <p className="mt-6 w-56 border-t border-border-strong" />
        </div>
        <div>
          <p className="text-text-muted">Date</p>
          <p className="mt-6 w-32 border-t border-border-strong" />
        </div>
      </div>
    </PrintableDoc>
  );
}
