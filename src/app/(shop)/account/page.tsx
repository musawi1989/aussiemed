import type { Metadata } from "next";
import Link from "next/link";
import { OrderProgress } from "@/components/OrderProgress";
import { formatAED } from "@/lib/money";
import { isOpenOrder } from "@/lib/order-progress";
import { accountOrders, accountOverview } from "@/lib/account";

export const metadata: Metadata = {
  title: "Your Account",
  description:
    "Your AussieMed account: what you have ordered, what you spend, and your branches.",
};

const aed = (fils: number) => formatAED(fils / 100);
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The account overview: the figures, and whatever is still in flight.
 *
 * The sign-in guard, the heading and the tabs live in the layout. The full
 * order list moved to its own tab — it belongs beside branch filtering and
 * progress tracking, and having it here as well would be two lists to keep in
 * step. What stays is the part that is an answer rather than a record: what is
 * open right now, and the last order, which is the one a buyer repeats.
 */
export default async function AccountPage() {
  const overview = await accountOverview();

  // A personal login with no trade account has no orders or branches to show.
  const orders = overview ? await accountOrders() : [];
  const open = orders.filter((order) => isOpenOrder(order.status));
  const latest = orders[0] ?? null;

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

        {metrics!.overdue && latest && (
          <p className="mt-3 rounded-card border-l-4 border-accent-border bg-accent-soft px-4 py-2.5 text-sm font-semibold text-text">
            It has been longer than usual since your last order.{" "}
            <Link
              href={`/account/reorder/${latest.reference}`}
              className="text-navy underline"
            >
              Repeat {latest.reference}
            </Link>{" "}
            in two clicks.
          </p>
        )}
      </section>

      {/* Only what is still moving. The whole history is one tab away, and
          copying it here would be two lists to keep in step. */}
      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight text-text">
            {open.length > 0 ? "Still on its way" : "Your last order"}
          </h2>
          <Link
            href="/account/orders"
            className="text-sm font-bold text-navy hover:underline"
          >
            All orders &rarr;
          </Link>
        </div>

        {orders.length === 0 ? (
          <p className="mt-4 rounded-card border border-border-base bg-surface px-4 py-8 text-center text-sm text-text-muted shadow-card">
            No orders yet. When you place one it appears here, ready to repeat.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {(open.length > 0 ? open : [latest!]).map((order) => (
              <li
                key={order.id}
                className="rounded-card border border-border-base bg-surface p-4 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
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
                </div>

                <div className="mt-4">
                  <OrderProgress status={order.status} />
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

