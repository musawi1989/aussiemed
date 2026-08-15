import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatAED } from "@/lib/money";

const aed = (fils: number) => formatAED(fils / 100);

/**
 * The supplier's dashboard.
 *
 * A supplier sees only their own products and only their own invoice lines —
 * never another supplier's, and never the whole order. Enforced by querying
 * through their supplier id rather than by filtering in the page.
 *
 * The role gate and the identity block live in the layout, so every screen
 * added to this portal later inherits both rather than repeating them.
 */
export default async function BusinessPortalPage() {
  const user = await getSessionUser();

  if (!user?.supplierId) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-xl font-bold text-text">No supplier attached</h1>
        <p className="mt-2 text-sm text-text-muted">
          This account has the supplier role but is not linked to a company, so
          there is nothing to show. An admin needs to link it.
        </p>
      </div>
    );
  }

  const [supplier, products, invoices] = await Promise.all([
    db.supplier.findUnique({ where: { id: user.supplierId } }),
    db.productMaster.findMany({
      where: { supplierId: user.supplierId },
      include: { skus: true, categories: { include: { category: true } } },
      orderBy: { name: "asc" },
    }),
    db.orderSupplierInvoice.findMany({
      where: { supplierId: user.supplierId },
      include: { order: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const outOfStock = products.filter((p) => p.skus.every((s) => s.manualOutOfStock));
  const revenue = invoices.reduce((n, i) => n + i.totalFils, 0);

  return (
    <>
      <h1 className="text-xl font-bold tracking-tight text-text">
        {supplier?.companyName}
      </h1>

      <ul className="mt-5 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Products", value: String(products.length) },
          { label: "Out of stock", value: String(outOfStock.length) },
          { label: "Invoices", value: String(invoices.length) },
          { label: "Invoiced", value: aed(revenue) },
        ].map((stat) => (
          <li
            key={stat.label}
            className="rounded-card border-l-4 border-navy bg-surface p-4 shadow-card"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-bold tnum text-text">{stat.value}</p>
          </li>
        ))}
      </ul>

      <section className="mt-10">
        <h2 className="text-lg font-bold tracking-tight text-text">
          Orders placed with you
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Your invoice lines only. Other suppliers&rsquo; lines on the same
          order are not shown.
        </p>

        {invoices.length === 0 ? (
          <p className="mt-4 rounded-card border border-border-base bg-surface p-8 text-center text-text-muted">
            No orders yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="rounded-card border border-border-base bg-surface p-4 shadow-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold tnum text-navy">
                      {invoice.invoiceNumber}
                    </p>
                    <p className="mt-0.5 text-sm text-text-muted tnum">
                      Order {invoice.order.reference} &middot;{" "}
                      {invoice.order.placedAt.toISOString().slice(0, 10)} &middot;{" "}
                      {invoice.items.length} lines
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">
                      {invoice.status}
                    </span>
                    <span className="font-bold tnum text-text">
                      {aed(invoice.totalFils)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold tracking-tight text-text">
          Your products
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Editing, adding and bulk upload arrive with the supplier portal
          proper. A supplier will never be able to approve their own product.
        </p>

        <div className="mt-4 overflow-x-auto rounded-card border border-border-base bg-surface shadow-card">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-base bg-surface-sunken text-left text-xs uppercase tracking-wide text-text-subtle">
                <th scope="col" className="px-4 py-2.5 font-bold">Product</th>
                <th scope="col" className="px-4 py-2.5 font-bold">Category</th>
                <th scope="col" className="px-4 py-2.5 text-right font-bold">SKUs</th>
                <th scope="col" className="px-4 py-2.5 text-right font-bold">From</th>
                <th scope="col" className="px-4 py-2.5 text-right font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.slice(0, 40).map((product) => {
                const cheapest = Math.min(...product.skus.map((s) => s.priceFils));
                const unavailable = product.skus.every((s) => s.manualOutOfStock);
                return (
                  <tr key={product.id} className="border-b border-border-base last:border-0">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/products/${product.slug}`}
                        className="text-text hover:text-navy"
                      >
                        {product.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">
                      {product.categories.at(-1)?.category.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tnum text-text">
                      {product.skus.length}
                    </td>
                    <td className="px-4 py-2.5 text-right tnum text-text">
                      {Number.isFinite(cheapest) ? aed(cheapest) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-bold ${
                          unavailable
                            ? "bg-danger-soft text-danger"
                            : "bg-success-soft text-success"
                        }`}
                      >
                        {unavailable ? "Out of stock" : product.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {products.length > 40 && (
          <p className="mt-2 text-xs text-text-subtle tnum">
            Showing 40 of {products.length}. Paging arrives with the full portal.
          </p>
        )}
      </section>
    </>
  );
}
