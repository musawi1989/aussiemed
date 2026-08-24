import Link from "next/link";
import { notFound } from "next/navigation";
import { getPurchaseOrder } from "@/lib/supplier-portal";
import { StatusPill } from "@/components/StatusPill";
import { paymentStatusOf } from "@/lib/status-tone";
import { ConfirmQuantities } from "@/components/portal/ConfirmQuantities";
import { courierOptions } from "@/lib/couriers";
import {
  AcknowledgeButton,
  DispatchForm,
} from "@/components/portal/PurchaseOrderActions";

const dubai = (d: Date) =>
  new Date(d.getTime() + 4 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

/**
 * One purchase order, as its supplier sees it.
 *
 * getPurchaseOrder scopes by the supplier id on the session, so another
 * supplier's number does not resolve at all rather than resolving and being
 * refused — there is no branch here that could be forgotten.
 *
 * Costs are shown, because this is what AussieMed is paying them. Sell prices
 * and customers are not, because neither is any of their business.
 */
export default async function SupplierPurchaseOrderPage({
  params,
}: {
  params: Promise<{ poNumber: string }>;
}) {
  const { poNumber } = await params;
  const po = await getPurchaseOrder(decodeURIComponent(poNumber));

  if (!po) notFound();

  // After the guard: no point listing couriers for a purchase order that does
  // not exist. Carries whatever this PO already names, so an archived courier
  // on an old dispatch is still selectable rather than silently blanked.
  const couriers = await courierOptions(po.courier);

  const units = po.lines.reduce((n, l) => n + l.qtyOrdered, 0);
  const done = po.status === "Received" || po.status === "Cancelled";

  return (
    <>
      <Link
        href="/business-portal"
        className="text-sm font-semibold text-text-muted hover:text-navy"
      >
        &larr; All orders
      </Link>

      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight tnum text-text">
            {po.poNumber}
            <StatusPill axis="fulfilment" status={po.status} />
            {/* Where the goods are, and where the money is. They move
                independently — an order received in full can be unpaid for
                another month — so both are on the heading rather than one
                standing in for the other. */}
            <StatusPill axis="payment" status={paymentStatusOf(po, new Date())} />
          </h1>
          <p className="mt-1 text-sm text-text-muted tnum">
            {po.lines.length} line{po.lines.length === 1 ? "" : "s"} &middot;{" "}
            {units} unit{units === 1 ? "" : "s"}
            {po.sentAt ? ` · sent ${dubai(po.sentAt)}` : ""}
          </p>
        </div>

        {!po.acknowledgedAt && (
          <AcknowledgeButton id={po.id} poNumber={po.poNumber} />
        )}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
          <h2 className="text-base font-bold tracking-tight text-text">
            What we need
          </h2>

          {/* What they can actually send, before the table of what we asked
              for. It is the question this page exists to have answered, and a
              form below a table is a form that gets scrolled past.

              Hidden once the order is closed: there is nothing left to promise
              on an order already received or cancelled. */}
          {!done && (
            <ConfirmQuantities
              id={po.id}
              poNumber={po.poNumber}
              lines={po.lines.map((line) => ({
                id: line.id,
                code: line.supplierPartNumberSnapshot ?? line.skuCodeSnapshot,
                name: line.nameSnapshot,
                qtyOrdered: line.qtyOrdered,
                qtyConfirmed: line.qtyConfirmed,
              }))}
            />
          )}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse text-sm [&_.tnum]:whitespace-nowrap [&_td]:align-top [&_th]:whitespace-nowrap">
              <thead className="border-b border-border-strong text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
                <tr>
                  <th className="py-1.5">Your code</th>
                  <th className="py-1.5">Description</th>
                  <th className="py-1.5 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((line) => (
                  <tr key={line.id} className="border-b border-border-base last:border-0">
                    <td className="py-2 tnum font-semibold text-text">
                      {line.supplierPartNumberSnapshot ?? (
                        <span className="text-text-subtle">—</span>
                      )}
                    </td>
                    <td className="py-2 text-text-muted">{line.nameSnapshot}</td>
                    <td className="py-2 text-right tnum font-bold text-text">
                      {line.qtyOrdered}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!done && (
            <div className="mt-5 border-t border-border-base pt-4">
              <h3 className="text-sm font-bold text-text">Despatch</h3>
              <p className="mt-1 text-xs text-text-muted">
                Tell us what is on its way so goods-in can expect it. Courier and
                tracking are optional.
              </p>
              <DispatchForm
                id={po.id}
                poNumber={po.poNumber}
                courier={po.courier}
                courierOptions={couriers}
                trackingNumber={po.trackingNumber}
              />
            </div>
          )}
        </section>

        <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
          <h2 className="text-base font-bold tracking-tight text-text">
            Progress
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Sent to you" value={po.sentAt ? dubai(po.sentAt) : "—"} />
            <Row
              label="Acknowledged"
              value={po.acknowledgedAt ? dubai(po.acknowledgedAt) : "not yet"}
              warn={!po.acknowledgedAt}
            />
            <Row
              label="Despatched"
              value={po.dispatchedAt ? dubai(po.dispatchedAt) : "not yet"}
            />
            <Row label="Courier" value={po.courier ?? "—"} />
            <Row label="Tracking" value={po.trackingNumber ?? "—"} />
            <Row
              label="Received by us"
              value={po.receivedAt ? dubai(po.receivedAt) : "not yet"}
            />
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-text-subtle">
            All times Dubai. Acknowledgement is recorded once and not changed
            afterwards.
          </p>
        </section>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className={`text-right tnum ${warn ? "font-bold text-danger" : "text-text"}`}>
        {value}
      </dd>
    </div>
  );
}
