import { ProductThumbnail } from "@/components/ProductThumbnail";
import { notFound } from "next/navigation";
import { PrintableDoc } from "@/components/PrintableDoc";
import { sellerIdentity } from "@/lib/seller-identity";
import { DocTable, SellerBlock, day, loadOrderForDocs } from "@/lib/order-docs";
import { addressLines, parseShippingAddress } from "@/lib/shipping-address";
import { loadShipment, toFollowAfter } from "@/lib/shipments";

/**
 * The packing list for one batch — the copy that travels in that box.
 *
 * THE DIFFERENCE FROM THE ORDER-WIDE NOTE NEXT DOOR. That one lists everything
 * on the order and marks the backordered lines "to follow", which is right for
 * an order that goes out once. It is wrong for an order that goes out three
 * times: the second box would arrive with a note listing items delivered a
 * fortnight earlier, and goods-in would check them off against a box that does
 * not contain them.
 *
 * This lists ONLY what is in this box, carries this box's own courier and
 * consignment number, and says what remains owed as at the day it was packed —
 * see toFollowAfter for why that is counted up to this shipment rather than up
 * to now.
 */
export default async function ShipmentPackingListPage({
  params,
}: {
  params: Promise<{ reference: string; sequence: string }>;
}) {
  const { reference, sequence: raw } = await params;

  const sequence = Number(raw);
  if (!Number.isInteger(sequence) || sequence < 1) notFound();

  const [order, seller, shipment] = await Promise.all([
    loadOrderForDocs(reference),
    sellerIdentity(),
    loadShipment(reference, sequence),
  ]);

  if (!shipment) notFound();

  const toFollow = await toFollowAfter(reference, sequence);
  const shipping = parseShippingAddress(order.shippingSnapshot);
  const units = shipment.lines.reduce((n, line) => n + line.qty, 0);

  const lines = [...shipment.lines].sort((a, b) =>
    a.orderItem.nameSnapshot.localeCompare(b.orderItem.nameSnapshot)
  );

  return (
    <PrintableDoc
      title={`Packing list ${sequence} · ${order.reference}`}
      backHref={`/admin/orders/${reference}`}
    >
      <div className="mt-3 flex flex-wrap justify-between gap-6">
        <SellerBlock seller={seller} />
        <div className="text-sm leading-relaxed">
          <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
            Deliver to
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
          {/* The batch number leads. Somebody holding two boxes from the same
              order needs to tell them apart before anything else on the page
              is useful to them. */}
          <p className="font-bold text-text">Shipment {sequence}</p>
          <p>Order {order.reference}</p>
          <p>Placed {day(order.placedAt)}</p>
          <p>
            {shipment.dispatchedAt
              ? `Despatched ${day(shipment.dispatchedAt)}`
              : "Not yet despatched"}
          </p>
          {shipment.courier && <p>Courier {shipment.courier}</p>}
          {shipment.trackingNumber && <p>Tracking {shipment.trackingNumber}</p>}
          {order.poReference && <p>PO {order.poReference}</p>}
        </div>
      </div>

      <p className="mt-4 text-sm text-text">
        <span className="font-bold">This box contains {units} unit{units === 1 ? "" : "s"}</span>{" "}
        across {lines.length} line{lines.length === 1 ? "" : "s"}. Anything else
        on order {order.reference} is not in this delivery.
      </p>

      <DocTable
        head={
          <tr>
            <th className="py-1.5">Item code</th>
            <th className="py-1.5">Description</th>
            <th className="py-1.5">Unit</th>
            <th className="py-1.5">Batch / lot</th>
            <th className="py-1.5">Expiry</th>
            <th className="py-1.5 text-right">Qty in this box</th>
          </tr>
        }
      >
        {lines.map((line) => (
          <tr key={line.orderItem.id} className="border-b border-border-base">
            <td className="py-2 tnum font-semibold text-text">
              <ProductThumbnail skuCode={line.orderItem.skuCodeSnapshot} />{line.orderItem.skuCodeSnapshot}
            </td>
            <td className="py-2 text-text-muted">{line.orderItem.nameSnapshot}</td>
            <td className="py-2 text-text-muted">
              {line.orderItem.unitLabelSnapshot}
            </td>
            <td className="py-2 tnum text-text-muted">
              {line.orderItem.batchCodeSnapshot ?? "—"}
            </td>
            <td className="py-2 tnum text-text-muted">
              {day(line.orderItem.expiresOnSnapshot)}
            </td>
            <td className="py-2 text-right tnum font-bold text-text">
              {line.qty}
              {/* Says so when this is part of a line rather than all of it, so
                  goods-in counting eight against an order for twenty knows the
                  box is right and the order is not finished. */}
              {line.qty < line.orderItem.qty && (
                <span className="block text-[11px] font-normal text-text-subtle">
                  of {line.orderItem.qty} ordered
                </span>
              )}
            </td>
          </tr>
        ))}
      </DocTable>

      {toFollow.length > 0 && (
        <p className="mt-4 rounded-card bg-accent-soft px-3 py-2 text-sm text-text">
          <span className="font-bold">To follow:</span>{" "}
          {toFollow.map((line) => `${line.skuCode} × ${line.qty}`).join(", ")}.
          These are still owed on this order and will come separately, at no
          extra delivery cost.
        </p>
      )}

      {shipment.note && (
        <p className="mt-4 text-sm text-text">
          <span className="font-bold">Note:</span> {shipment.note}
        </p>
      )}

      {order.customerNotes && (
        <p className="mt-4 text-sm text-text">
          <span className="font-bold">Delivery instruction:</span>{" "}
          {order.customerNotes}
        </p>
      )}

      {/*
        Signed by hand, like the order-wide note. The whole worth of it is that
        the person who took THIS box wrote their own name on it — which is
        precisely what a single note per order could not capture when an order
        arrived in three deliveries on three different days.
      */}
      <div className="mt-8 break-inside-avoid rounded-card border border-border-strong p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-text">
          Received by
        </p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          Please check this box against the quantities above before signing.
          Report any shortage or damage within 48 hours, quoting order{" "}
          {order.reference} and shipment {sequence}.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
          <SignatureLine label="Name in capitals" />
          <SignatureLine label="Signature" />
          <SignatureLine label="Date" />
          <SignatureLine label="Company stamp, if you use one" />
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-text-subtle">
          Signing acknowledges receipt of the quantities listed on this shipment
          only. It is not agreement to the price &mdash; no prices appear on this
          document.
        </p>
      </div>
    </PrintableDoc>
  );
}

/**
 * A ruled line to write on. A bare bottom border rather than a box: a box
 * invites somebody to write inside it and a signature does not fit in one.
 */
function SignatureLine({ label }: { label: string }) {
  return (
    <div>
      <div className="h-10 border-b border-text-subtle" />
      <p className="mt-1 text-[11px] uppercase tracking-wide text-text-subtle">
        {label}
      </p>
    </div>
  );
}
