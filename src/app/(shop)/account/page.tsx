import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { formatAED } from "@/lib/money";
import {
  accountBranches,
  accountOrders,
  accountOverview,
  savedProducts,
} from "@/lib/account";

export const metadata: Metadata = {
  title: "Your Account",
  description:
    "Your AussieMed account: what you have ordered, what you spend, your branches and the products you have saved.",
};

const aed = (fils: number) => formatAED(fils / 100);
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The account landing.
 *
 * It used to open with a grid of every item ever ordered, one tile each, which
 * grew into an unreadable wall as soon as anyone had ordered more than a few
 * things and duplicated what the order history already said. Reordering now
 * hangs off an order, where a buyer looks for it — "the same as last time"
 * means an order, not a pile of items.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/account");
  if (user.role === "Admin") redirect("/admin");
  if (user.role === "Supplier") redirect("/business-portal");

  const { branch } = await searchParams;
  const overview = await accountOverview();

  // A personal account with no organisation has no branches or staff to show.
  const trade = Boolean(overview);

  const [orders, branches, saved] = trade
    ? await Promise.all([accountOrders(branch), accountBranches(), savedProducts()])
    : [[], [], await savedProducts()];

  const metrics = overview?.metrics;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-base pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">
            {overview?.organisationName ?? user.name}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {user.name} &middot; {user.email}
          </p>
        </div>
        {trade && (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/account/branches"
              className="rounded-card border border-border-strong bg-surface px-3 py-2 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
            >
              Branches
            </Link>
            <Link
              href="/account/staff"
              className="rounded-card border border-border-strong bg-surface px-3 py-2 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
            >
              Who orders
            </Link>
          </div>
        )}
      </div>

      {/* --- the numbers --- */}

      {metrics && (
        <section className="mt-8">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Orders placed" value={String(metrics.orderCount)} />
            <Stat label="Total spent" value={aed(metrics.totalSpentFils)} note="excluding VAT" />
            <Stat
              label="Average order"
              value={metrics.orderCount > 0 ? aed(metrics.averageOrderFils) : "—"}
            />
            <Stat
              label="You usually order"
              value={
                metrics.cadenceDays !== null
                  ? `every ~${metrics.cadenceDays} days`
                  : "—"
              }
              note={
                metrics.cadenceDays === null
                  ? "after three orders we can tell"
                  : metrics.daysSinceLastOrder !== null
                    ? `last order ${metrics.daysSinceLastOrder} days ago`
                    : undefined
              }
              warn={metrics.overdue}
            />
          </ul>

          {metrics.overdue && (
            <p className="mt-3 rounded-card border-l-4 border-accent-border bg-accent-soft px-4 py-2.5 text-sm font-semibold text-text">
              It has been longer than usual since your last order. Reorder your
              last one below in two clicks.
            </p>
          )}
        </section>
      )}

      {/* --- orders, by branch --- */}

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight text-text">
            Your orders
          </h2>

          {branches.length > 1 && (
            <nav className="flex flex-wrap gap-1.5" aria-label="Filter by branch">
              <BranchChip href="/account" active={!branch} label="All branches" />
              {branches.map((b) => (
                <BranchChip
                  key={b.id}
                  href={`/account?branch=${b.id}`}
                  active={branch === b.id}
                  label={b.label ?? b.city}
                />
              ))}
            </nav>
          )}
        </div>

        {orders.length === 0 ? (
          <p className="mt-4 rounded-card border border-border-base bg-surface px-4 py-8 text-center text-sm text-text-muted shadow-card">
            {branch
              ? "No orders for this branch yet."
              : "No orders yet. When you place one it appears here, ready to repeat."}
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {orders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-base bg-surface p-4 shadow-card"
              >
                <div className="min-w-0">
                  <Link
                    href={`/orders/${order.reference}`}
                    className="font-bold tnum text-navy hover:underline"
                  >
                    {order.reference}
                  </Link>
                  <p className="mt-0.5 text-sm text-text-muted tnum">
                    {day(order.placedAt)} &middot; {order.items.length}{" "}
                    {order.items.length === 1 ? "line" : "lines"}
                    {order.address?.label ? ` · ${order.address.label}` : ""}
                    {order.staff?.name || order.placedByName
                      ? ` · ordered by ${order.staff?.name ?? order.placedByName}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">
                    {order.status}
                  </span>
                  <span className="font-bold tnum text-text">
                    {aed(order.totalFils)}
                  </span>
                  <Link
                    href={`/account/reorder/${order.reference}`}
                    className="rounded-card bg-brand px-3 py-1.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover"
                  >
                    Reorder
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- saved products --- */}

      <section className="mt-12">
        <h2 className="text-lg font-bold tracking-tight text-text">
          Saved products
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Everything you have saved, grouped by what it is. Tap the heart on any
          product to add it.
        </p>

        {saved.length === 0 ? (
          <p className="mt-4 rounded-card border border-border-base bg-surface px-4 py-8 text-center text-sm text-text-muted shadow-card">
            Nothing saved yet.
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {/* Only categories with something in them — a list of empty
                headings is the catalogue tree pretending to be a personal
                list. */}
            {saved.map((group) => (
              <div key={group.categoryId ?? "none"}>
                <h3 className="text-sm font-bold uppercase tracking-wide text-text-subtle">
                  {group.categoryName}{" "}
                  <span className="tnum text-text-muted">
                    ({group.products.length})
                  </span>
                </h3>
                <ul className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {group.products.map((product) => (
                    <li key={product.id}>
                      <Link
                        href={`/products/${product.slug}`}
                        className="flex h-full gap-3 rounded-card border border-border-base bg-surface p-3 shadow-card transition-colors hover:border-navy-border"
                      >
                        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-card bg-surface-sunken">
                          {product.image && (
                            <Image
                              src={product.image}
                              alt=""
                              fill
                              sizes="56px"
                              className="object-contain"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-snug text-text">
                            {product.name}
                          </span>
                          <span className="mt-0.5 block text-xs tnum text-text-muted">
                            {product.outOfStock
                              ? "Out of stock"
                              : product.priceFils !== null
                                ? aed(product.priceFils)
                                : ""}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  warn = false,
}: {
  label: string;
  value: string;
  note?: string;
  warn?: boolean;
}) {
  return (
    <li
      className={`rounded-card border bg-surface p-4 shadow-card ${
        warn ? "border-accent-border" : "border-border-base"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tnum text-text">{value}</p>
      {note && <p className="mt-0.5 text-xs text-text-subtle">{note}</p>}
    </li>
  );
}

function BranchChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-card px-3 py-1.5 text-sm font-bold transition-colors ${
        active
          ? "bg-navy text-on-navy"
          : "border border-border-strong bg-surface text-text-muted hover:text-navy"
      }`}
    >
      {label}
    </Link>
  );
}
