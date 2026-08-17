import Link from "next/link";
import { db } from "@/lib/db";
import { formatAED } from "@/lib/money";
import { ViewTabs } from "@/components/admin/ViewTabs";
import { StatusPill } from "@/components/StatusPill";
import { paymentStatusOf } from "@/lib/status-tone";
import { ORDER_STATUSES } from "@/lib/order-views";

const aed = (fils: number) => formatAED(fils / 100);

/**
 * The same queue as a board.
 *
 * The list answers "find me this order"; the board answers "where is the work
 * piling up". Cancelled is deliberately left off — it is not a stage of the
 * work, and a column of dead orders makes the board harder to read.
 *
 * Cards lead with what stops an order moving: lines on backorder, a payment
 * overdue, a missing TRN. The reference and the money are secondary, because
 * anyone reading a board is looking for the exception.
 */
const LANES = ORDER_STATUSES.filter((s) => s !== "Cancelled");

export default async function AdminOrdersBoardPage() {
  const orders = await db.order.findMany({
    where: { status: { in: [...LANES] } },
    orderBy: { placedAt: "asc" },
    take: 400,
    include: {
      user: { select: { name: true } },
      organisation: { select: { name: true, trn: true, paymentTerms: true } },
      items: { select: { status: true } },
    },
  });

  const today = new Date();

  const lanes = LANES.map((status) => ({
    status,
    orders: orders.filter((o) => o.status === status),
  }));

  return (
    <>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">Orders</h1>
          <p className="mt-1 text-sm text-text-muted tnum">
            {orders.length} open {orders.length === 1 ? "order" : "orders"} across{" "}
            {LANES.length} stages
          </p>
        </div>
        <ViewTabs active="board" />
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        {lanes.map((lane) => {
          const value = lane.orders.reduce((n, o) => n + o.totalFils, 0);
          return (
            <section
              key={lane.status}
              className="rounded-card border border-border-base bg-surface-sunken p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold text-text">{lane.status}</h2>
                <p className="text-xs tnum text-text-subtle">
                  {lane.orders.length} · {aed(value)}
                </p>
              </div>

              <ul className="mt-3 space-y-2">
                {lane.orders.map((order) => {
                  const backordered = order.items.filter(
                    (i) => i.status === "Backordered"
                  ).length;
                  const overdue =
                    order.paymentStatus !== "Paid" &&
                    order.paymentDueOn !== null &&
                    order.paymentDueOn < today;

                  const flags = [
                    backordered > 0 && `${backordered} on backorder`,
                    overdue && "payment overdue",
                    !order.organisation?.trn && "no TRN",
                  ].filter(Boolean) as string[];

                  return (
                    <li key={order.id}>
                      <Link
                        href={`/admin/orders/${order.reference}`}
                        className="block rounded-card border border-border-base bg-surface p-3 shadow-card transition-colors hover:border-navy-border"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-bold tnum text-navy">
                            {order.reference}
                          </span>
                          <span className="text-sm font-bold tnum text-text">
                            {aed(order.totalFils)}
                          </span>
                        </div>

                        <p className="mt-0.5 truncate text-xs text-text-muted">
                          {order.organisation?.name ??
                            order.user?.name ??
                            "Guest"}
                          {order.organisation?.paymentTerms &&
                          order.organisation.paymentTerms !== "Prepaid"
                            ? ` · ${order.organisation.paymentTerms}`
                            : ""}
                        </p>


                        {flags.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-1">
                            {flags.map((flag) => (
                              <li
                                key={flag}
                                className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent"
                              >
                                {flag}
                              </li>
                            ))}
                          </ul>
                        )}

                        <p className="mt-2">
                          <StatusPill
                            axis="payment"
                            status={paymentStatusOf(order, new Date())}
                          />
                        </p>
                      </Link>
                    </li>
                  );
                })}

                {lane.orders.length === 0 && (
                  <li className="rounded-card border border-dashed border-border-strong px-3 py-6 text-center text-xs text-text-subtle">
                    Nothing here
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
