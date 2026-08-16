import type { Metadata } from "next";
import Link from "next/link";
import { formatAED } from "@/lib/money";
import { accountBranches, accountOrders, accountOverview } from "@/lib/account";

export const metadata: Metadata = {
  title: "Your Account",
  description:
    "Your AussieMed account: what you have ordered, what you spend, and your branches.",
};

const aed = (fils: number) => formatAED(fils / 100);
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The account overview: the figures, then the orders.
 *
 * The sign-in guard, the heading and the tabs live in the layout. Saved
 * products moved to their own tab — they had grown into a wall at the bottom
 * of this page that nobody scrolled to.
 *
 * Reordering hangs off an order rather than a grid of every item ever bought,
 * because "the same as last time" means an order, not a pile of items.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { branch } = await searchParams;
  const overview = await accountOverview();

  // A personal login with no trade account has no orders or branches to show.
  const [orders, branches] = overview
    ? await Promise.all([accountOrders(branch), accountBranches()])
    : [[], []];

  const metrics = overview?.metrics;

  if (!overview) {
    return (
      <div className="rounded-card border border-border-base bg-surface px-4 py-12 text-center shadow-card">
        <h2 className="text-lg font-bold text-text">No trade account yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-text-muted">
          Your sign-in is not linked to a trade account, so there are no orders,
          branches or terms to show. Anything you save still appears under My
          products.
        </p>
        <Link
          href="/products"
          className="mt-5 inline-block rounded-card bg-brand px-5 py-2.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover"
        >
          Browse the catalogue
        </Link>
      </div>
    );
  }

  return (
    <>
      <section>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Orders placed" value={String(metrics!.orderCount)} />
          <Stat
            label="Total spent"
            value={aed(metrics!.totalSpentFils)}
            note="excluding VAT"
          />
          <Stat
            label="Average order"
            value={metrics!.orderCount > 0 ? aed(metrics!.averageOrderFils) : "—"}
          />
          <Stat
            label="You usually order"
            value={
              metrics!.cadenceDays !== null
                ? `every ~${metrics!.cadenceDays} days`
                : "—"
            }
            note={
              metrics!.cadenceDays === null
                ? "after three orders we can tell"
                : metrics!.daysSinceLastOrder !== null
                  ? `last order ${metrics!.daysSinceLastOrder} days ago`
                  : undefined
            }
            warn={metrics!.overdue}
          />
        </ul>

        {metrics!.overdue && (
          <p className="mt-3 rounded-card border-l-4 border-accent-border bg-accent-soft px-4 py-2.5 text-sm font-semibold text-text">
            It has been longer than usual since your last order. Repeat your
            last one below in two clicks.
          </p>
        )}
      </section>

      <section className="mt-8">
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
    </>
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
