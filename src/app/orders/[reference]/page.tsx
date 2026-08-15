import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByReference } from "@/lib/orders";
import { getSessionUser } from "@/lib/auth";
import { readCartKey } from "@/lib/cart-cookie";
import { formatAED } from "@/lib/money";

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
  const isOwner = Boolean(user && order.userId === user.id);
  // A guest order belongs to whoever still holds the cart that placed it.
  const isGuestWithClaim =
    !order.userId && Boolean(cartKey) && order.guestCartKey === cartKey;

  if (!isAdmin && !isOwner && !isGuestWithClaim) notFound();

  const shipping = order.shippingSnapshot
    ? (JSON.parse(order.shippingSnapshot) as Record<string, string>)
    : null;

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
        <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-bold text-accent">
          {order.status}
        </span>
      </div>

      {shipping && (
        <section className="mt-6 rounded-card border border-border-base bg-surface p-5 shadow-card">
          <h2 className="text-base font-bold text-text">Delivering to</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            {shipping.company}
            <br />
            {shipping.contact} &middot; {shipping.phone}
            <br />
            {shipping.line1}, {shipping.emirate}
          </p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold tracking-tight text-text">Invoices</h2>
        <p className="mt-1 text-sm text-text-muted tnum">
          This order spans {order.invoices.length}{" "}
          {order.invoices.length === 1 ? "supplier" : "suppliers"}, so it carries{" "}
          {order.invoices.length}{" "}
          {order.invoices.length === 1 ? "invoice" : "invoices"} under the one
          reference number.
        </p>

        <div className="mt-4 space-y-4">
          {order.invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="overflow-hidden rounded-card border border-border-base bg-surface shadow-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-base bg-surface-sunken px-4 py-2.5">
                <div>
                  <p className="text-sm font-bold text-text">
                    {invoice.supplier.companyName}
                  </p>
                  <p className="text-xs text-text-subtle tnum">
                    Invoice {invoice.invoiceNumber}
                  </p>
                </div>
                <p className="font-bold tnum text-text">
                  {aed(invoice.totalFils)}
                </p>
              </div>

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
                    {invoice.items.map((item) => (
                      <tr key={item.id} className="border-b border-border-base last:border-0">
                        <td className="px-4 py-2.5">
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
                          </span>
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
                    <tr>
                      <td colSpan={4} className="px-4 py-1.5 text-right text-text-muted">Subtotal</td>
                      <td className="px-4 py-1.5 text-right tnum text-text">{aed(invoice.subtotalFils)}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-4 py-1.5 text-right text-text-muted">VAT</td>
                      <td className="px-4 py-1.5 text-right tnum text-text">{aed(invoice.vatFils)}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-4 pb-2.5 pt-1.5 text-right font-bold text-text">Invoice total</td>
                      <td className="px-4 pb-2.5 pt-1.5 text-right font-bold tnum text-text">{aed(invoice.totalFils)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold text-text">Order total</h2>
        <dl className="mt-3 space-y-2 text-sm">
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
