import { LogoEditor } from "@/components/LogoEditor";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  listPurchaseOrders,
  SUPPLIER_PO_STATUSES,
} from "@/lib/supplier-portal";
import { PurchaseOrderFilters } from "@/components/portal/PurchaseOrderFilters";
import { StatusPill } from "@/components/StatusPill";
import { paymentStatusOf } from "@/lib/status-tone";
import { BackorderList } from "@/components/portal/BackorderList";
import { supplierBackorders } from "@/lib/backorders";
import { AcknowledgeButton } from "@/components/portal/PurchaseOrderActions";
import { supplierPermissions } from "@/lib/permissions";
import { SupplierWorklist } from "@/components/portal/SupplierWorklist";

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
export default async function BusinessPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string }>;
}) {
  const filters = await searchParams;
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

  const perms = await supplierPermissions();

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
    /*
     * TWO LISTS, on purpose.
     *
     * The tiles below count everything; the table counts what the filters
     * asked for. Sharing one list would make "Orders in total" fall to 3 the
     * moment somebody filtered by month, which reads as orders going missing.
     */
    listPurchaseOrders(),
  ]);

  const filtered = await listPurchaseOrders(filters);
  const filtering = Boolean(
    filters.q || (filters.status && filters.status !== "all") || filters.from || filters.to
  );

  // Always loaded, so the section can say "nothing outstanding" rather than
  // vanishing — a panel that only exists when something is wrong is one nobody
  // learns the location of.
  const backorders = await supplierBackorders(user.supplierId);

  // One clock for the whole render. Two calls a millisecond apart can put an
  // invoice on one side of its due date in one pill and the other side in the
  // next.
  const now = new Date();

  const open = orders.filter((po) => po.status !== "Received" && po.status !== "Cancelled");
  const awaitingAck = open.filter((po) => !po.acknowledgedAt);

  return (
    <>
      <LogoEditor kind="supplier" id={user.supplierId} name={supplier?.companyName ?? user.name} />
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

      <SupplierWorklist />
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

      <PurchaseOrderFilters
        statuses={SUPPLIER_PO_STATUSES}
        current={filters}
      />

      {filtering && (
        <p className="mt-2 text-xs text-text-muted tnum">
          {filtered.length} of {orders.length} shown.{" "}
          <a href="/business-portal" className="font-semibold text-navy hover:underline">
            Clear filters
          </a>
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="mt-3 rounded-card border border-border-base bg-surface px-4 py-8 text-center text-sm text-text-muted shadow-card">
          {/* Two different nothings. "No orders yet" to a supplier who has
              filtered them all out is simply wrong, and sends them to ask us
              where their orders went. */}
          {filtering
            ? "No orders match those filters."
            : "No orders yet. One appears here as soon as AussieMed sends it."}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {filtered.map((po) => {
            const units = po.lines.reduce((n, l) => n + l.qtyOrdered, 0);
            const age = po.sentAt ? daysSince(po.sentAt) : 0;
            const late =
              !po.acknowledgedAt &&
              po.sentAt &&
              Date.now() - po.sentAt.getTime() >
                (supplier?.ackSlaHours ?? 24) * 3_600_000;

            return (
              /*
                THE WHOLE CARD OPENS THE ORDER.

                Done with a stretched link rather than by wrapping the card in
                an anchor: there is a button inside it, and a button inside a
                link is invalid HTML that browsers resolve by breaking one of
                them. So the PO number stays the only real link and its ::after
                is stretched over the card, while the Acknowledge button is
                lifted above that overlay and keeps working.

                One consequence worth knowing: text inside the card is no
                longer selectable by dragging, because the overlay is on top.
                That is the accepted trade for a card-sized target, and the
                reason the reference itself is still a visible link.
              */
              <li
                key={po.id}
                className={`relative rounded-card border bg-surface p-4 shadow-card transition-colors hover:border-navy-border hover:bg-navy-soft/40 ${
                  late ? "border-danger" : "border-border-base"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/business-portal/orders/${po.poNumber}`}
                        className="text-sm font-bold tnum text-navy after:absolute after:inset-0 after:content-[''] hover:underline"
                      >
                        {po.poNumber}
                      </Link>
                      <StatusPill axis="fulfilment" status={po.status} />
                      {/* Whether WE have paid THEM. Two questions on one line,
                          and they move independently: an order can be received
                          in full and unpaid for another month. Derived rather
                          than read straight off the column, so an invoice that
                          fell due yesterday reads Overdue today without a
                          nightly job having to run. */}
                      <StatusPill
                        axis="payment"
                        status={paymentStatusOf(po, now)}
                        size="small"
                      />
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

                  {!po.acknowledgedAt && perms.acknowledgeOrders !== "off" && (
                    /* Above the stretched link, or the card would swallow the
                       click and open the order instead of acknowledging it.
                       A plain block comment rather than a JSX one, because
                       this sits inside a JS expression where a JSX comment
                       would be a second expression and a syntax error. */
                    <span className="relative z-10">
                      <AcknowledgeButton id={po.id} poNumber={po.poNumber} />
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <BackorderList lines={backorders} />
    </>
  );
}
