import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatAED } from "@/lib/money";

export const metadata: Metadata = {
  title: "Your Account",
  description:
    "Reorder what you bought last time, and review your AussieMed orders, reference numbers and invoices.",
};

const aed = (fils: number) => formatAED(fils / 100);

/**
 * The account landing, now reading real orders.
 *
 * Reorder-first: what this buyer has actually ordered leads the page, ahead of
 * browsing. Until there is an order history it says so rather than showing an
 * empty grid.
 */
export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/account");
  if (user.role === "Admin") redirect("/admin");

  const [orders, organisation] = await Promise.all([
    db.order.findMany({
      where: { userId: user.id },
      orderBy: { placedAt: "desc" },
      include: {
        items: {
          include: { sku: { include: { product: true } } },
        },
      },
    }),
    user.organisationId
      ? db.organisation.findUnique({ where: { id: user.organisationId } })
      : null,
  ]);

  // Most recently ordered first, with the quantity last used.
  const reorder = new Map<
    string,
    { name: string; slug: string; skuCode: string; qty: number; when: Date }
  >();
  for (const order of orders) {
    for (const item of order.items) {
      if (reorder.has(item.skuCodeSnapshot)) continue;
      reorder.set(item.skuCodeSnapshot, {
        name: item.nameSnapshot,
        slug: item.sku.product.slug,
        skuCode: item.skuCodeSnapshot,
        qty: item.qty,
        when: order.placedAt,
      });
    }
  }
  const reorderList = [...reorder.values()];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-base pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">
            {organisation?.name ?? user.name}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {user.name} &middot; {user.email}
            {organisation?.paymentTerms
              ? ` · ${organisation.paymentTerms} terms`
              : ""}
          </p>
        </div>
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-text">
              Order again
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Everything you&rsquo;ve bought before, at the quantity you last
              used.
            </p>
          </div>
          <Link
            href="/products"
            className="text-sm font-bold text-navy hover:underline"
          >
            Browse the full catalogue
          </Link>
        </div>

        {reorderList.length === 0 ? (
          <div className="mt-4 rounded-card border border-border-base bg-surface p-10 text-center">
            <p className="text-text">You haven&rsquo;t ordered anything yet.</p>
            <Link
              href="/products"
              className="mt-4 inline-block rounded-card bg-red px-5 py-2.5 text-sm font-bold text-on-red transition-colors hover:bg-red-hover"
            >
              Start an order
            </Link>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {reorderList.map((entry) => (
              <li
                key={entry.skuCode}
                className="rounded-card border border-border-base bg-surface p-3 shadow-card"
              >
                <h3 className="text-sm font-medium leading-snug text-text">
                  <Link href={`/products/${entry.slug}`} className="hover:text-navy">
                    {entry.name}
                  </Link>
                </h3>
                <p className="mt-0.5 text-xs text-text-subtle tnum">
                  {entry.skuCode} &middot; last ordered{" "}
                  {entry.when.toISOString().slice(0, 10)} &middot; {entry.qty}
                </p>
                <Link
                  href={`/products/${entry.slug}`}
                  className="mt-2 flex h-9 items-center justify-center rounded-card bg-red text-sm font-bold text-on-red transition-colors hover:bg-red-hover"
                >
                  Order again
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-bold tracking-tight text-text">
          Your orders
        </h2>

        {orders.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">No orders yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.reference}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-base bg-surface p-4 shadow-card transition-colors hover:border-navy-border"
                >
                  <div>
                    <p className="font-bold tnum text-navy">{order.reference}</p>
                    <p className="mt-0.5 text-sm text-text-muted tnum">
                      {order.placedAt.toISOString().slice(0, 10)} &middot;{" "}
                      {order.items.length}{" "}
                      {order.items.length === 1 ? "line" : "lines"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">
                      {order.status}
                    </span>
                    <span className="font-bold tnum text-text">
                      {aed(order.totalFils)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
