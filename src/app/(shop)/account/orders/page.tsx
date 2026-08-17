import type { Metadata } from "next";
import Link from "next/link";
import { OrderProgress } from "@/components/OrderProgress";
import { StatusPill } from "@/components/StatusPill";
import { InvoiceActions } from "@/components/account/InvoiceActions";
import { formatAED } from "@/lib/money";
import {
  isOpenOrder,
  orderProgress,
  splitDeliveryNote,
} from "@/lib/order-progress";
import { deliveryStatusOf, paymentStatusOf } from "@/lib/status-tone";
import { accountBranches, accountOrders, accountSession } from "@/lib/account";

export const metadata: Metadata = {
  title: "Your orders",
  description:
    "Track the AussieMed orders you have open and look back over the ones you have received.",
};

const aed = (fils: number) => formatAED(fils / 100);
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Orders, split by whether anything is still going to happen to them.
 *
 * Open orders come first with their progress shown, because that is the
 * question someone opens this page to answer — a date and a status word do not
 * say when the gloves arrive. Received and cancelled orders drop into a
 * history below, where the useful action is repeating one rather than tracking
 * it.
 *
 * Branch filtering lives here rather than on the overview: a practice with
 * three sites asks "where is Jumeirah's order", and that is a question about
 * this list.
 */
export default async function AccountOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { branch } = await searchParams;
  const session = await accountSession();

  if (!session) {
    return (
      <div className="rounded-card border border-border-base bg-surface px-4 py-12 text-center shadow-card">
        <h2 className="text-lg font-bold text-text">No trade account yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-text-muted">
          Your sign-in is not linked to a trade account, so there are no orders
          to track.
        </p>
      </div>
    );
  }

  const [orders, branches] = await Promise.all([
    accountOrders(branch),
    accountBranches(),
  ]);

  const open = orders.filter((order) => isOpenOrder(order.status));
  const past = orders.filter((order) => !isOpenOrder(order.status));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-text">
            Your orders
          </h2>
          <p className="mt-1 text-sm text-text-muted tnum">
            {orders.length === 0
              ? "Nothing ordered yet"
              : `${open.length} in progress · ${past.length} completed`}
          </p>
        </div>

        {branches.length > 1 && (
          <nav className="flex flex-wrap gap-1.5" aria-label="Filter by branch">
            <BranchChip
              href="/account/orders"
              active={!branch}
              label="All branches"
            />
            {branches.map((b) => (
              <BranchChip
                key={b.id}
                href={`/account/orders?branch=${b.id}`}
                active={branch === b.id}
                label={b.label ?? b.city}
              />
            ))}
          </nav>
        )}
      </div>

      {orders.length === 0 ? (
        <div className="mt-5 rounded-card border border-border-base bg-surface px-4 py-12 text-center shadow-card">
          <p className="text-sm text-text-muted">
            {branch
              ? "No orders for this branch yet."
              : "When you place an order it appears here, with where it has got to."}
          </p>
          <Link
            href="/products"
            className="mt-5 inline-block rounded-card bg-brand px-5 py-2.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover"
          >
            Browse the catalogue
          </Link>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <section className="mt-6">
              <h3 className="text-sm font-bold uppercase tracking-wide text-text-subtle">
                In progress{" "}
                <span className="tnum text-text-muted">({open.length})</span>
              </h3>
              <ul className="mt-2 space-y-3">
                {open.map((order) => (
                  <OpenOrderCard key={order.id} order={order} />
                ))}
              </ul>
            </section>
          )}

          {past.length > 0 && (
            <section className="mt-8">
              <h3 className="text-sm font-bold uppercase tracking-wide text-text-subtle">
                Completed{" "}
                <span className="tnum text-text-muted">({past.length})</span>
              </h3>
              <ul className="mt-2 space-y-2">
                {past.map((order) => (
                  <PastOrderRow key={order.id} order={order} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

type OrderRow = Awaited<ReturnType<typeof accountOrders>>[number];

function OpenOrderCard({ order }: { order: OrderRow }) {
  const split = splitDeliveryNote(order.items.map((item) => item.status));

  return (
    <li className="rounded-card border border-border-base bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/orders/${order.reference}`}
            className="font-bold tnum text-navy hover:underline"
          >
            {order.reference}
          </Link>
          <p className="mt-0.5 text-sm text-text-muted tnum">
            <Meta order={order} />
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="font-bold tnum text-text">{aed(order.totalFils)}</span>
          {/* Money and goods travel separately on credit terms, and a customer
              who cannot see an invoice has gone overdue only finds out when we
              ring them. */}
          <StatusPill
            status={paymentStatusOf(order, new Date())}
            axis="payment"
            size="small"
          />
        </div>
      </div>

      <div className="mt-4">
        <OrderProgress status={order.status} />
      </div>

      {/* Only when it is true: on an order where every line agrees with the
          headline this says nothing, and a note that says nothing is noise. */}
      {split && (
        <p className="mt-2 rounded-card border-l-4 border-accent-border bg-accent-soft px-3 py-2 text-sm text-text">
          {split}
        </p>
      )}

      {(order.courier || order.trackingNumber || order.estimatedShipmentOn) && (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-border-base pt-3 text-sm">
          {order.estimatedShipmentOn && (
            <Fact label="Expected to leave us">
              {day(order.estimatedShipmentOn)}
            </Fact>
          )}
          {order.courier && <Fact label="Courier">{order.courier}</Fact>}
          {order.trackingNumber && (
            <Fact label="Tracking">{order.trackingNumber}</Fact>
          )}
        </dl>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/orders/${order.reference}`}
          className="rounded-card border border-border-strong bg-surface px-3 py-1.5 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
        >
          View order
        </Link>
        <Link
          href={`/account/reorder/${order.reference}`}
          className="rounded-card bg-brand px-3 py-1.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover"
        >
          Order again
        </Link>
        <InvoiceActions reference={order.reference} />
      </div>
    </li>
  );
}

function PastOrderRow({ order }: { order: OrderRow }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-base bg-surface p-4 shadow-card">
      <div className="min-w-0">
        <Link
          href={`/orders/${order.reference}`}
          className="font-bold tnum text-navy hover:underline"
        >
          {order.reference}
        </Link>
        <p className="mt-0.5 text-sm text-text-muted tnum">
          <Meta order={order} />
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* Both questions, because a delivered order can still be unpaid — and
            on a list of past orders that is the only one left worth asking. */}
        <StatusPill
          status={deliveryStatusOf(order)}
          axis="delivery"
          size="small"
        />
        <StatusPill
          status={paymentStatusOf(order, new Date())}
          axis="payment"
          size="small"
        />
        <span className="font-bold tnum text-text">{aed(order.totalFils)}</span>
        <Link
          href={`/account/reorder/${order.reference}`}
          className="rounded-card bg-brand px-3 py-1.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover"
        >
          Reorder
        </Link>
        <InvoiceActions reference={order.reference} compact />
      </div>
    </li>
  );
}

function Meta({ order }: { order: OrderRow }) {
  const who = order.staff?.name ?? order.placedByName;
  return (
    <>
      {day(order.placedAt)} &middot; {order.items.length}{" "}
      {order.items.length === 1 ? "line" : "lines"}
      {order.address?.label ? ` · ${order.address.label}` : ""}
      {who ? ` · ordered by ${who}` : ""}
    </>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </dt>
      <dd className="tnum text-text">{children}</dd>
    </div>
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
