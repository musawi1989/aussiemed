import type { Metadata } from "next";
import Link from "next/link";
import { RoleSignInForm } from "@/components/RoleSignInForm";
import { TestCredentials } from "@/components/TestCredentials";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatAED } from "@/lib/money";

export const metadata: Metadata = {
  title: "Admin",
  description: "AussieMed administration.",
  robots: { index: false, follow: false },
};

const aed = (fils: number) => formatAED(fils / 100);

/**
 * The admin door and dashboard.
 *
 * Read-only for now: real figures from the database, so the numbers can be
 * trusted, with the management screens still to come. Everything below is
 * counted live rather than cached, so admin figures cannot drift from the
 * storefront's.
 */
export default async function AdminPage() {
  const user = await getSessionUser();

  if (!user || user.role !== "Admin") {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-bold tracking-tight text-text">Admin</h1>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          Administration for AussieMed staff.
        </p>

        <div className="mt-6">
          <RoleSignInForm expectRole="Admin" next="/admin" accent="navy" />
        </div>

        <TestCredentials role="Admin" />
      </div>
    );
  }

  const [
    products,
    activeProducts,
    outOfStockSkus,
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
    db.productSku.count({ where: { manualOutOfStock: true } }),
    db.category.count(),
    db.supplier.count(),
    db.user.count({ where: { role: "Customer" } }),
    db.order.count(),
    db.order.count({ where: { status: "Pending" } }),
    db.order.aggregate({ _sum: { totalFils: true } }),
    db.order.findMany({
      orderBy: { placedAt: "desc" },
      take: 10,
      include: { invoices: { select: { id: true } }, user: true },
    }),
  ]);

  const stats = [
    { label: "Orders", value: String(orders), hint: `${pendingOrders} pending` },
    {
      label: "Revenue",
      value: aed(revenue._sum.totalFils ?? 0),
      hint: "all orders, inc. VAT",
    },
    { label: "Products", value: String(products), hint: `${activeProducts} active` },
    { label: "Out of stock", value: String(outOfStockSkus), hint: "SKUs" },
    { label: "Categories", value: String(categories), hint: "" },
    { label: "Suppliers", value: String(suppliers), hint: "" },
    { label: "Customers", value: String(customers), hint: "" },
  ];

  /** Screens still to build, listed so the gap is visible rather than implied. */
  const upcoming = [
    ["Products", "Approve, edit and deactivate. A supplier can never self-approve."],
    ["Categories & brands", "Rename safely, with counts that match the storefront."],
    ["Suppliers", "Create with a mandatory secondary email, edit, suspend."],
    ["Customers", "View accounts, credit terms and order history."],
    ["Orders & invoices", "Status transitions and resending documents."],
    ["Bulk upload", "Comma-safe .xlsx with a per-row report."],
    ["Marketing", "Wishlists and abandoned carts."],
    ["Reports", "Sales by supplier, category and period."],
    ["Settings", "VAT rate, email templates, general configuration."],
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-base pb-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-red">
            Admin
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text">
            AussieMed
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {user.name} &middot; {user.email}
          </p>
        </div>
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <li
            key={stat.label}
            className="rounded-card border-l-4 border-red bg-surface p-4 shadow-card"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-bold tnum text-text">{stat.value}</p>
            {stat.hint && (
              <p className="mt-0.5 text-xs text-text-subtle tnum">{stat.hint}</p>
            )}
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
                  href={`/orders/${order.reference}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-base bg-surface p-4 shadow-card transition-colors hover:border-navy-border"
                >
                  <div>
                    <p className="font-bold tnum text-navy">{order.reference}</p>
                    <p className="mt-0.5 text-sm text-text-muted tnum">
                      {order.placedAt.toISOString().slice(0, 10)} &middot;{" "}
                      {order.invoices.length}{" "}
                      {order.invoices.length === 1 ? "invoice" : "invoices"}{" "}
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

      <section className="mt-10">
        <h2 className="text-lg font-bold tracking-tight text-text">
          Still to build
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          The dashboard above reads real data. These screens do not exist yet.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map(([title, note]) => (
            <li
              key={title}
              className="rounded-card border border-dashed border-border-strong bg-surface-sunken p-4"
            >
              <p className="text-sm font-bold text-text">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{note}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
