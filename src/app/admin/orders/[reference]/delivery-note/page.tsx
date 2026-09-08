import { ProductThumbnail } from "@/components/ProductThumbnail";
import { PrintableDoc } from "@/components/PrintableDoc";
import { sellerIdentity } from "@/lib/seller-identity";
import { DocTable, SellerBlock, day, loadOrderForDocs } from "@/lib/order-docs";
import { addressLines, parseShippingAddress } from "@/lib/shipping-address";

/**
 * The packing list and delivery note — the copy that travels with the goods.
 *
 * ONE DOCUMENT DOING BOTH JOBS, at the client's request. It is the list of what
 * is in the box and it is the sheet somebody signs to say they got it; printing
 * two pieces of paper that carry the same lines only invites them to disagree.
 * The title says both names because a customer's goods-in will call it whichever
 * one they are used to.
 *
 * THE PICKING LIST IS STILL SEPARATE AND STILL INTERNAL. It groups lines by
 * supplier, which is how the stock is shelved — and which supplier each line
 * came from is not something to hand a customer. Merging that one in would put
 * our buying arrangements in the box.
 *
 * Priceless, for a different reason from the picking list: the person receiving
 * the delivery is often not the person who buys, and a ward clerk should not be
 * handed the commercial terms. What they do need is exactly what is in the box,
 * with the batch and expiry of each line, so goods-in can check it against their
 * own records — and now, room to sign for it.
 */
export default async function DeliveryNotePage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const [order, seller] = await Promise.all([
    loadOrderForDocs(reference),
    sellerIdentity(),
  ]);

  // Cancelled lines are not in the box, so they are not on the note.
  const shipped = order.items.filter((item) => item.status !== "Cancelled");
  const held = order.items.filter((item) => item.status === "Backordered");
  const shipping = parseShippingAddress(order.shippingSnapshot);

  return (
    <PrintableDoc
      title={`Packing list & delivery note · ${order.reference}`}
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
        {shipped.map((item) => (
          <tr key={item.id} className="border-b border-border-base">
            <td className="py-2 tnum font-semibold text-text">
              <ProductThumbnail skuCode={item.skuCodeSnapshot} />{item.skuCodeSnapshot}
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
          {held.map((item) => `${item.skuCodeSnapshot} × ${item.qty}`).join(", ")}
          . These lines are on backorder and are not in this delivery.
        </p>
      )}

      {order.customerNotes && (
        <p className="mt-4 text-sm text-text">
          <span className="font-bold">Delivery instruction:</span>{" "}
          {order.customerNotes}
        </p>
      )}

      {/*
        Received by — the half that makes this a delivery note rather than a
        packing list.

        PRINTED EMPTY AND SIGNED BY HAND. There is no version of this that gets
        filled in from our side: the whole worth of it is that the person who
        took the goods wrote their own name on it. What comes back is
        photographed onto the order.

        break-inside-avoid so a long order cannot tear the signature off the
        lines it belongs to, and the borders are print black rather than a
        theme colour, because a pale grey rule is invisible on paper.
      */}
      <div className="mt-8 break-inside-avoid rounded-card border border-border-strong p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-text">
          Received by
        </p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          Please check the goods against this note before signing. Report any
          shortage or damage within 48 hours, quoting the order number above.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
          <SignatureLine label="Name in capitals" />
          <SignatureLine label="Signature" />
          <SignatureLine label="Date" />
          <SignatureLine label="Company stamp, if you use one" />
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-text-subtle">
          Signing acknowledges receipt of the quantities listed. It is not
          agreement to the price &mdash; no prices appear on this document.
        </p>
      </div>

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

/**
 * A ruled line to write on.
 *
 * A bare bottom border rather than a box: a box invites somebody to write
 * inside it and a signature does not fit in one. The height is set so there is
 * actually room for a hand — the usual mistake with these is a line so tight
 * the name runs into the label above it.
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
