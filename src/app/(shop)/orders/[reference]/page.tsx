import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderProgress } from "@/components/OrderProgress";
import { getOrderByReference } from "@/lib/orders";
import { getSessionUser } from "@/lib/auth";
import { readCartKey } from "@/lib/cart-cookie";
import { formatAED } from "@/lib/money";
import { LineSaving } from "@/components/LineSaving";
import { orderDiscount, sourceLabel } from "@/lib/order-discounts";
import { orderProgress, splitDeliveryNote } from "@/lib/order-progress";
import { addressLines, parseShippingAddress } from "@/lib/shipping-address";
import { ProductThumb } from "@/components/ProductThumb";
import { stableId } from "@/lib/catalog";
import { CustomerShipments } from "@/components/CustomerShipments";
import { requireAdmin } from "@/lib/admin";

type Params = Promise<{ reference: string }>;

const aed = (fils: number) => formatAED(fils / 100);

export const metadata: Metadata = {
  title: "Your Order",
  description:
    "Details of an order placed with AussieMed, including its reference number, supplier invoices, VAT and total in AED.",
};

/**
 * A real order, read back from the database.
 *
 * Access rules, in order of precedence:
 *   - an admin sees any order
 *   - the account that placed it sees it
 *   - a guest sees an order only if it has no owner, and only from the cart
 *     that placed it, so a guest cannot walk the sequential references
 *
 * A missing order and a forbidden one both return 404, so the response cannot
 * be used to discover which references exist.
 */
export default async function OrderPage({ params }: { params: Params }) {
  const { reference } = await params;
  const order = await getOrderByReference(reference);
  if (!order) notFound();

  const [user, cartKey] = await Promise.all([getSessionUser(), readCartKey()]);

  const isAdmin = user?.role === "Admin";
  if (isAdmin) await requireAdmin("orders", "view");
  const isOwner = Boolean(user && order.userId === user.id);
  // A guest order belongs to whoever still holds the cart that placed it.
  const isGuestWithClaim =
    !order.userId && Boolean(cartKey) && order.guestCartKey === cartKey;

  if (!isAdmin && !isOwner && !isGuestWithClaim) notFound();

  // What their account took off, as recorded on the lines at the time. Never
  // recomputed from today's prices — see order-discounts.ts.
  const saved = orderDiscount(order.items);

  // Shared with the admin screen and the delivery note. A snapshot written by
  // an older checkout no longer throws JSON.parse on the page a customer opens
  // to find out where their order is going.
  const shipping = parseShippingAddress(order.shippingSnapshot);
  const progress = orderProgress(order.status);
  const split = splitDeliveryNote(order.items.map((item) => item.status));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-base pb-5">
        <div>
          {/* "Reference number" everywhere, never "order number". */}
          <p className="text-sm text-text-muted">Reference number</p>
          <h1 className="text-2xl font-bold tracking-tight tnum text-navy">
            {order.reference}
          </h1>
          <p className="mt-1 text-sm text-text-muted tnum">
            Placed {order.placedAt.toISOString().slice(0, 10)}
            {order.poReference ? ` · PO ${order.poReference}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          {/* The customer's word for it, not the warehouse's — "Pending" reads
              as "we might not do this" to the person waiting on the box. */}
          <span
            className={`rounded-full px-3 py-1 text-sm font-bold ${
              progress.cancelled
                ? "bg-danger-soft text-danger"
                : progress.closed
                  ? "bg-success-soft text-success"
                  : "bg-accent-soft text-accent"
            }`}
          >
            {progress.headline}
          </span>

          {/*
            A plain link to the PDF, which saves on click.

            Not target="_blank" and not window.print(). The route this points
            at answers with Content-Disposition: attachment, and a browser
            handling an attachment downloads it WITHOUT navigating — so the
            buyer stays on the order they were reading and gets a file, rather
            than a new tab and a print dialogue to work through.

            The HTML document is still there at /document for anyone who wants
            to print rather than save, and it is what the PDF is rendered from.
          */}
          <a
            href={`/orders/${order.reference}/document/pdf`}
            className="inline-flex items-center gap-2 rounded-card border border-border-strong bg-surface px-3 py-2 text-sm font-bold text-text transition-colors hover:border-navy hover:text-navy"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            Download PDF
          </a>
        </div>
      </div>

      <section className="mt-6 rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold text-text">Where it has got to</h2>
        <div className="mt-4">
          <OrderProgress status={order.status} />
        </div>

        {split && (
          <p className="mt-3 rounded-card border-l-4 border-accent-border bg-accent-soft px-3 py-2 text-sm text-text">
            {split}
          </p>
        )}

        {(order.estimatedShipmentOn || order.courier || order.trackingNumber) && (
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-border-base pt-4 text-sm">
            {order.estimatedShipmentOn && (
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-text-subtle">
                  Expected to leave us
                </dt>
                <dd className="tnum text-text">
                  {order.estimatedShipmentOn.toISOString().slice(0, 10)}
                </dd>
              </div>
            )}
            {order.courier && (
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-text-subtle">
                  Courier
                </dt>
                <dd className="text-text">{order.courier}</dd>
              </div>
            )}
            {order.trackingNumber && (
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-text-subtle">
                  Tracking
                </dt>
                <dd className="tnum text-text">{order.trackingNumber}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <CustomerShipments order={order} />
      {shipping && (
        <section className="mt-6 rounded-card border border-border-base bg-surface p-5 shadow-card">
          <h2 className="text-base font-bold text-text">Delivering to</h2>
          <address className="mt-2 text-sm not-italic leading-relaxed text-text-muted">
            {addressLines(shipping).map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
        </section>
      )}

      {/*
        One order, one list of items, one invoice from AussieMed.

        This used to be grouped into a card per supplier, with each supplier
        named and its own invoice number — which told the customer both who
        AussieMed buys from and how the order was split between them. Under
        DEC-24 they learn neither, and under DEC-22 AussieMed is the seller of
        record, so there is one invoice to show. The split still exists in the
        data; it is simply not the customer's business. See BE-38.
      */}
      <section className="mt-8">
        <h2 className="text-lg font-bold tracking-tight text-text">Items</h2>

        <div className="mt-4 overflow-hidden rounded-card border border-border-base bg-surface shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-base text-left text-xs uppercase tracking-wide text-text-subtle">
                  <th scope="col" className="px-4 py-2 font-bold">Item</th>
                  <th scope="col" className="px-4 py-2 text-right font-bold">Qty</th>
                  <th scope="col" className="px-4 py-2 text-right font-bold">Unit</th>
                  <th scope="col" className="px-4 py-2 text-right font-bold">VAT</th>
                  <th scope="col" className="px-4 py-2 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                    <tr key={item.id} className="border-b border-border-base last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="flex items-start gap-3">
                          {/*
                            The photograph, so a buyer reading an order back
                            recognises what they bought. On a trade catalogue
                            the names are long and near-identical — three
                            nitrile gloves differing only by a size and a
                            standard — and a column of that text is genuinely
                            hard to check against what turned up in the box.

                            LINKED WITH THE NAME, not beside it: two adjacent
                            links to the same place is one target that happens
                            to look like two, and a thumbnail is the easier
                            thing to hit on a phone.

                            The image is the product's CURRENT one, unlike the
                            name and price which are snapshots. There is no
                            image snapshot to take — nothing on the order line
                            records what the photograph looked like — and a
                            missing tile is a worse answer than a slightly
                            newer photograph of the same item.
                          */}
                          <Link
                            href={`/products/${item.sku.product.slug}`}
                            className="shrink-0"
                            aria-hidden="true"
                            tabIndex={-1}
                          >
                            <ProductThumb
                              size="sm"
                              product={{
                                id: stableId(item.sku.product.slug),
                                name: item.nameSnapshot,
                                brand: item.sku.product.brand?.name ?? null,
                                images: item.sku.product.images
                                  // A SKU-specific photograph beats the range
                                  // shot: the black glove, not the family.
                                  .filter(
                                    (image) =>
                                      image.skuId === null ||
                                      image.skuId === item.skuId
                                  )
                                  .sort(
                                    (a, b) =>
                                      Number(b.skuId === item.skuId) -
                                      Number(a.skuId === item.skuId)
                                  )
                                  .map((image) => image.path),
                                categoryPath: item.sku.product.categories.map(
                                  (link) => ({
                                    id: stableId(link.category.slug),
                                  })
                                ),
                              }}
                              className="h-14 w-14 rounded-card border border-border-base"
                              sizes="56px"
                            />
                          </Link>
                          <div className="min-w-0">
                            <Link
                              href={`/products/${item.sku.product.slug}`}
                              className="text-text hover:text-navy"
                            >
                              {/* The snapshot, not the current name — a later
                                  rename must not rewrite this order. */}
                              {item.nameSnapshot}
                            </Link>
                            <span className="block text-xs text-text-subtle tnum">
                              {item.skuCodeSnapshot} &middot; {item.unitLabelSnapshot}
                              {item.taxClassSnapshot === "ZeroRated" && (
                                <span className="ml-1.5 font-bold text-success">
                                  VAT free
                                </span>
                              )}
                              {/* What their account took off this line, as it
                                  was recorded when the order was placed. */}
                              <LineSaving
                                line={item}
                                accountBasisPoints={order.accountDiscountBasisPoints}
                                struck
                                className="ml-1.5"
                              />
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tnum text-text">{item.qty}</td>
                      <td className="px-4 py-2.5 text-right tnum text-text-muted">
                        {aed(item.unitPriceFils)}
                      </td>
                      <td className="px-4 py-2.5 text-right tnum text-text-muted">
                        {aed(item.vatFils)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold tnum text-text">
                        {aed(item.lineTotalFils)}
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot className="bg-surface-sunken">
                {saved.discounted && saved.listSubtotalFils !== null && (
                  <tr>
                    <td colSpan={4} className="px-4 py-1.5 text-right text-text-muted">Subtotal at list</td>
                    <td className="px-4 py-1.5 text-right tnum text-text-muted">{aed(saved.listSubtotalFils)}</td>
                  </tr>
                )}
                {saved.sources.map((source) =>
                  saved.savingBySource[source] > 0 ? (
                    <tr key={source}>
                      <td colSpan={4} className="px-4 py-1.5 text-right text-accent">
                        {sourceLabel(
                          source,
                          source === "AccountDiscount"
                            ? order.accountDiscountBasisPoints
                            : undefined
                        )}
                      </td>
                      <td className="px-4 py-1.5 text-right font-bold tnum text-accent">
                        &minus;{aed(saved.savingBySource[source])}
                      </td>
                    </tr>
                  ) : null
                )}
                <tr>
                  <td colSpan={4} className="px-4 py-1.5 text-right text-text-muted">Subtotal</td>
                  <td className="px-4 py-1.5 text-right tnum text-text">{aed(order.subtotalFils)}</td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-4 py-1.5 text-right text-text-muted">VAT</td>
                  <td className="px-4 py-1.5 text-right tnum text-text">{aed(order.vatFils)}</td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-4 pb-2.5 pt-1.5 text-right font-bold text-text">Total</td>
                  <td className="px-4 pb-2.5 pt-1.5 text-right font-bold tnum text-text">{aed(order.totalFils)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold text-text">Order total</h2>
        <dl className="mt-3 space-y-2 text-sm">
          {saved.discounted && saved.listSubtotalFils !== null && (
            <div className="flex justify-between">
              <dt className="text-text-muted">Subtotal at list</dt>
              <dd className="tnum text-text-muted">{aed(saved.listSubtotalFils)}</dd>
            </div>
          )}
          {saved.sources.map((source) =>
            saved.savingBySource[source] > 0 ? (
              <div key={source} className="flex justify-between">
                <dt className="text-accent">
                  {sourceLabel(
                    source,
                    source === "AccountDiscount"
                      ? order.accountDiscountBasisPoints
                      : undefined
                  )}
                </dt>
                <dd className="font-bold tnum text-accent">
                  &minus;{aed(saved.savingBySource[source])}
                </dd>
              </div>
            ) : null
          )}
          <div className="flex justify-between">
            <dt className="text-text-muted">Subtotal</dt>
            <dd className="font-bold tnum text-text">{aed(order.subtotalFils)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted tnum">
              VAT ({order.vatRateBasisPoints / 100}%)
            </dt>
            <dd className="font-bold tnum text-text">{aed(order.vatFils)}</dd>
          </div>
          <div className="flex justify-between border-t border-border-base pt-2">
            <dt className="font-bold text-text">Total</dt>
            <dd className="text-lg font-bold tnum text-text">{aed(order.totalFils)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-text-subtle">
          The VAT rate is stored on the order as it was when placed, so a future
          rate change cannot alter this document.
        </p>
      </section>
    </div>
  );
}
