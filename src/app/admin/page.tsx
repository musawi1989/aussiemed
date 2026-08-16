import Link from "next/link";
import { db } from "@/lib/db";
import { formatAED } from "@/lib/money";

const aed = (fils: number) => formatAED(fils / 100);

/**
 * The dashboard.
 *
 * Every figure is counted live rather than cached, so admin numbers cannot
 * drift from the storefront's. At this size that is free; BE-23 tracks the
 * point where it stops being.
 */
export default async function AdminPage() {
  const [
    products,
    activeProducts,
    pendingProducts,
    outOfStockSkus,
    uncategorised,
    categories,
    suppliers,
    customers,
    orders,
    pendingOrders,
    revenue,
    recent,
  ] = await Promise.all([
    db.productMaster.count(),
    db.productMaster.count({ where: { status: "Active" } }),
    db.productMaster.count({ where: { status: "PendingApproval" } }),
    db.productSku.count({ where: { manualOutOfStock: true, isActive: true } }),
    db.productMaster.count({
      where: { status: "Active", categories: { none: {} } },
    }),
    db.category.count(),
    db.supplier.count({ where: { status: "Active" } }),
    db.user.count({ where: { role: "Customer" } }),
    db.order.count(),
    db.order.count({ where: { status: "Pending" } }),
    db.order.aggregate({ _sum: { totalFils: true } }),
    db.order.findMany({
      orderBy: { placedAt: "desc" },
      take: 10,
      include: { items: { select: { id: true } }, user: true },
    }),
  ]);

  const stats = [
    {
      label: "Orders",
      value: String(orders),
      hint: `${pendingOrders} pending`,
      href: "/admin/orders",
    },
    {
      label: "Revenue",
      value: aed(revenue._sum.totalFils ?? 0),
      hint: "all orders, inc. VAT",
      href: "/admin/orders",
    },
    {
      label: "Products",
      value: String(activeProducts),
      // "71 in total" reads as a bigger catalogue; it is 60 plus 11 retired.
      hint: `live · ${products - activeProducts} retired`,
      href: "/admin/products",
    },
    {
      label: "Out of stock",
      value: String(outOfStockSkus),
      hint: "active SKUs",
      href: "/admin/products?stock=out",
    },
    {
      label: "Categories",
      value: String(categories),
      hint: "",
      href: "/admin/categories",
    },
    {
      label: "Suppliers",
      value: String(suppliers),
      hint: "active",
      href: "/admin/suppliers",
    },
    {
      label: "Customers",
      value: String(customers),
      hint: "",
      href: "/admin/customers",
    },
  ];

  /**
   * Things that need a person, rather than things that happened. An empty list
   * here should mean there is nothing to do — so only put something in it when
   * that is true.
   */
  const attention = [
    pendingProducts > 0 && {
      href: "/admin/products?status=PendingApproval",
      text: `${pendingProducts} product${pendingProducts === 1 ? "" : "s"} waiting for approval`,
    },
    uncategorised > 0 && {
      href: "/admin/products",
      text: `${uncategorised} active product${uncategorised === 1 ? " has" : "s have"} no category, so nobody can browse to ${uncategorised === 1 ? "it" : "them"}`,
    },
    pendingOrders > 0 && {
      href: "/admin/orders?status=Pending",
      text: `${pendingOrders} order${pendingOrders === 1 ? "" : "s"} still pending`,
    },
  ].filter(Boolean) as { href: string; text: string }[];

  return (
    <>
      {attention.length > 0 && (
        <ul className="mt-6 space-y-2">
          {attention.map((item) => (
            <li key={item.text}>
              <Link
                href={item.href}
                className="block rounded-card border-l-4 border-accent-border bg-accent-soft px-4 py-3 text-sm font-semibold text-text transition-colors hover:bg-surface-hover"
              >
                {item.text}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <li key={stat.label}>
            <Link
              href={stat.href}
              className="block rounded-card border-l-4 border-red bg-surface p-4 shadow-card transition-shadow hover:shadow-raised"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
                {stat.label}
              </p>
              <p className="mt-1 text-2xl font-bold tnum text-text">{stat.value}</p>
              {stat.hint && (
                <p className="mt-0.5 text-xs text-text-subtle tnum">{stat.hint}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-10">
        <h2 className="text-lg font-bold tracking-tight text-text">
          Recent orders
        </h2>
        {recent.length === 0 ? (
          <p className="mt-4 rounded-card border border-border-base bg-surface p-8 text-center text-text-muted">
            No orders yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {recent.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/admin/orders/${order.reference}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-base bg-surface p-4 shadow-card transition-colors hover:border-navy-border"
                >
                  <div>
                    <p className="font-bold tnum text-navy">{order.reference}</p>
                    <p className="mt-0.5 text-sm text-text-muted tnum">
                      {order.placedAt.toISOString().slice(0, 10)} &middot;{" "}
                      {order.items.length}{" "}
                      {order.items.length === 1 ? "line" : "lines"}{" "}
                      &middot; {order.user?.email ?? "guest"}
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
    </>
  );
}
