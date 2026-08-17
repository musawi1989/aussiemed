import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { listPurchaseOrders } from "@/lib/supplier-portal";
import { StatusPill } from "@/components/StatusPill";
import { AcknowledgeButton } from "@/components/portal/PurchaseOrderActions";

const dubai = (d: Date) =>
  new Date(d.getTime() + 4 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

const daysSince = (d: Date) =>
  Math.floor((Date.now() - d.getTime()) / 86_400_000);

/**
 * The supplier's own orders — BE-39.
 *
 * This screen used to show customer orders: order references, invoice lines,
 * and the products of whoever had bought them. Under DEC-24 a supplier never
 * learns who bought anything, so it now shows purchase orders and nothing else.
 * That is not a filter over the old data, it is different data — a purchase
 * order belongs to one supplier by construction, so there is no customer here
 * to leak.
 *
 * Ageing is shown against the acknowledgement window and the promised lead
 * time, framed as their own targets rather than as a comparison with anyone
 * else. League tables belong in the admin panel and in a conversation.
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

  const [supplier, orders] = await Promise.all([
    db.supplier.findUnique({
      where: { id: user.supplierId },
      select: {
        companyName: true,
        ackSlaHours: true,
        promisedLeadTimeDays: true,
        isAvailable: true,
      },
    }),
    listPurchaseOrders(),
  ]);

  const open = orders.filter((po) => po.status !== "Received" && po.status !== "Cancelled");
  const awaitingAck = open.filter((po) => !po.acknowledgedAt);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">
            {supplier?.companyName}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Your orders from AussieMed. Acknowledge within{" "}
            {supplier?.ackSlaHours ?? 24} hours
            {supplier?.promisedLeadTimeDays
              ? `, deliver within ${supplier.promisedLeadTimeDays} days`
              : ""}
            .
          </p>
        </div>
      </div>

      {supplier && !supplier.isAvailable && (
        <p className="mt-4 rounded-card border-l-4 border-accent-border bg-accent-soft px-4 py-2.5 text-sm font-semibold text-text">
          Your account is marked unavailable, so new orders are going to the
          backup supplier. Contact AussieMed to turn this back on.
        </p>
      )}

      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Open orders", value: String(open.length) },
          { label: "Awaiting your acknowledgement", value: String(awaitingAck.length) },
          { label: "Orders in total", value: String(orders.length) },
        ].map((stat) => (
          <li
            key={stat.label}
            className="rounded-card border border-border-base bg-surface p-4 shadow-card"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-bold tnum text-text">{stat.value}</p>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-base font-bold tracking-tight text-text">
        Purchase orders
      </h2>

      {orders.length === 0 ? (
        <p className="mt-3 rounded-card border border-border-base bg-surface px-4 py-8 text-center text-sm text-text-muted shadow-card">
          No orders yet. They arrive once a day, after the afternoon cutoff.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {orders.map((po) => {
            const units = po.lines.reduce((n, l) => n + l.qtyOrdered, 0);
            const age = po.sentAt ? daysSince(po.sentAt) : 0;
            const late =
              !po.acknowledgedAt &&
              po.sentAt &&
              Date.now() - po.sentAt.getTime() >
                (supplier?.ackSlaHours ?? 24) * 3_600_000;

            return (
              <li
                key={po.id}
                className={`rounded-card border bg-surface p-4 shadow-card ${
                  late ? "border-danger" : "border-border-base"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/business-portal/orders/${po.poNumber}`}
                        className="text-sm font-bold tnum text-navy hover:underline"
                      >
                        {po.poNumber}
                      </Link>
                      <StatusPill axis="fulfilment" status={po.status} />
                      {late && (
                        <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">
                          acknowledgement overdue
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs tnum text-text-subtle">
                      {po.lines.length} line{po.lines.length === 1 ? "" : "s"}{" "}
                      &middot; {units} unit{units === 1 ? "" : "s"}
                      {po.sentAt
                        ? ` · sent ${dubai(po.sentAt)} (${age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`})`
                        : ""}
                    </p>
                  </div>

                  {!po.acknowledgedAt && (
                    <AcknowledgeButton id={po.id} poNumber={po.poNumber} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
