import Link from "next/link";
import { db } from "@/lib/db";
import { formatAED } from "@/lib/money";
import { StatusPill } from "@/components/StatusPill";
import {
  AutoSendToggle,
  BuildButton,
  CancelDraftButton,
  SendButton,
} from "@/components/admin/PurchasingControls";
import {
  getAutoSend,
  getCutoffHour,
  lastCutoffBefore,
  previewPurchaseOrders,
} from "@/lib/purchasing";

const aed = (fils: number) => formatAED(fils / 100);

/** Dubai time, because that is where the cutoff means something. */
function dubai(date: Date): string {
  return new Date(date.getTime() + 4 * 3_600_000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

const hourLabel = (hour: number) =>
  `${((hour + 11) % 12) + 1}${hour < 12 ? "am" : "pm"}`;

/**
 * Buying — BE-36.
 *
 * The day's demand pooled into one order per supplier. Everything here is
 * about what AussieMed is buying, never about who it is for: a purchase order
 * carries no customer at all, which is the model rather than a detail of the
 * layout — see SEC-05.
 */
export default async function PurchasingPage() {
  const [cutoffHour, autoSend] = await Promise.all([getCutoffHour(), getAutoSend()]);
  const cutoffAt = lastCutoffBefore(new Date(), cutoffHour);

  const [orders, plan] = await Promise.all([
    db.purchaseOrder.findMany({
      orderBy: [{ status: "asc" }, { cutoffAt: "desc" }],
      take: 50,
      include: {
        supplier: { select: { companyName: true, primaryEmail: true } },
        lines: { select: { qtyOrdered: true, wasFallback: true } },
      },
    }),
    previewPurchaseOrders(cutoffAt),
  ]);

  const waiting = plan.orders.reduce((n, o) => n + o.lines.length, 0);

  return (
    <>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">Buying</h1>
          <p className="mt-1 text-sm text-text-muted tnum">
            Cutoff {hourLabel(cutoffHour)} Dubai &middot; last passed{" "}
            {dubai(cutoffAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutoSendToggle on={autoSend} />
          <BuildButton cutoffLabel={`${dubai(cutoffAt)} Dubai`} />
        </div>
      </div>

      {autoSend && (
        <p className="mt-4 rounded-card border-l-4 border-danger bg-danger-soft px-4 py-2.5 text-sm font-semibold text-danger">
          Auto-send is on. Purchase orders go to suppliers at the cutoff with
          nobody reviewing them first.
        </p>
      )}

      {/* --- what the next build would do --- */}

      <section className="mt-6 rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight text-text">
          Waiting to be bought
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Ordered by customers and not yet on a purchase order, pooled by
          supplier. Nothing here has been sent or committed.
        </p>

        {plan.orders.length === 0 && plan.unsourceable.length === 0 ? (
          <p className="mt-4 rounded-card bg-surface-sunken px-4 py-6 text-center text-sm text-text-muted">
            Nothing outstanding. Every ordered line is already on a purchase
            order.
          </p>
        ) : (
          <p className="mt-3 text-sm text-text tnum">
            {waiting} line{waiting === 1 ? "" : "s"} across{" "}
            {plan.orders.length} supplier{plan.orders.length === 1 ? "" : "s"}
            {plan.unsourceable.length > 0
              ? `, and ${plan.unsourceable.length} that cannot be sourced`
              : ""}
            .
          </p>
        )}

        {plan.orders.length > 0 && (
          <ul className="mt-3 space-y-2">
            {plan.orders.map((order) => (
              <li
                key={order.supplierId}
                className="rounded-card border border-border-base bg-surface-sunken px-4 py-2.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-text">
                    {order.supplierName}
                  </p>
                  <p className="text-sm tnum text-text-muted">
                    {order.lines.length} line
                    {order.lines.length === 1 ? "" : "s"} &middot;{" "}
                    {order.totalCostFils === null
                      ? "cost not recorded"
                      : aed(order.totalCostFils)}
                  </p>
                </div>
                {order.lines.some((l) => l.wasFallback) && (
                  <p className="mt-1 text-xs font-semibold text-accent">
                    {order.lines.filter((l) => l.wasFallback).length} line
                    {order.lines.filter((l) => l.wasFallback).length === 1
                      ? ""
                      : "s"}{" "}
                    fell back from the primary supplier.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- the exception queue --- */}

      {plan.unsourceable.length > 0 && (
        <section className="mt-5 rounded-card border border-danger bg-danger-soft p-5">
          <h2 className="text-base font-bold tracking-tight text-danger">
            Cannot be sourced
          </h2>
          <p className="mt-1 text-sm text-text">
            Neither supplier can supply these. A customer is waiting on every
            one, so they are listed rather than quietly left off a purchase
            order.
          </p>
          <ul className="mt-3 space-y-1.5">
            {plan.unsourceable.map((line) => (
              <li
                key={line.orderItemId}
                className="rounded-card bg-surface px-3 py-2 text-sm"
              >
                <span className="font-bold text-text">{line.name}</span>
                <span className="ml-2 text-xs tnum text-text-subtle">
                  {line.skuCode} &middot; {line.qty} needed
                </span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  {line.reason}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- purchase orders --- */}

      <h2 className="mt-8 text-base font-bold tracking-tight text-text">
        Purchase orders
      </h2>

      {orders.length === 0 ? (
        <p className="mt-3 rounded-card border border-border-base bg-surface px-4 py-8 text-center text-sm text-text-muted shadow-card">
          None yet. Build the first one when there is demand waiting.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {orders.map((po) => {
            const units = po.lines.reduce((n, l) => n + l.qtyOrdered, 0);
            const fallbacks = po.lines.filter((l) => l.wasFallback).length;
            return (
              <li
                key={po.id}
                className="rounded-card border border-border-base bg-surface p-4 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/purchasing/${po.poNumber}`}
                        className="text-sm font-bold tnum text-navy hover:underline"
                      >
                        {po.poNumber}
                      </Link>
                      <StatusPill status={po.status} />
                      {fallbacks > 0 && (
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
                          {fallbacks} fallback{fallbacks === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-text">
                      {po.supplier.companyName}
                    </p>
                    <p className="text-xs tnum text-text-subtle">
                      {po.lines.length} line{po.lines.length === 1 ? "" : "s"}{" "}
                      &middot; {units} unit{units === 1 ? "" : "s"} &middot;
                      cutoff {dubai(po.cutoffAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold tnum text-text">
                      {po.totalCostFils > 0 ? aed(po.totalCostFils) : "—"}
                    </span>
                    {po.status === "Draft" && (
                      <>
                        <SendButton id={po.id} poNumber={po.poNumber} />
                        <CancelDraftButton id={po.id} poNumber={po.poNumber} />
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
