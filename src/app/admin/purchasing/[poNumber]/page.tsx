import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatAED } from "@/lib/money";
import { StatusPill } from "@/components/StatusPill";
import { CancelDraftButton, SendButton } from "@/components/admin/PurchasingControls";

const aed = (fils: number) => formatAED(fils / 100);
const dubai = (d: Date) =>
  new Date(d.getTime() + 4 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

/**
 * One purchase order, as the supplier will see it — BE-36.
 *
 * Read this page as the acceptance test for SEC-05: there is nothing on it
 * about who ordered any of it. The allocations exist, and are what will match
 * received goods to the clinics waiting for them, but they live on our side of
 * the wall and are never rendered here.
 */
export default async function PurchaseOrderPage({
  params,
}: {
  params: Promise<{ poNumber: string }>;
}) {
  const { poNumber } = await params;

  const po = await db.purchaseOrder.findUnique({
    where: { poNumber: decodeURIComponent(poNumber) },
    include: {
      supplier: {
        select: {
          id: true,
          companyName: true,
          primaryEmail: true,
          secondaryEmail: true,
          promisedLeadTimeDays: true,
        },
      },
      lines: { orderBy: { skuCodeSnapshot: "asc" } },
    },
  });

  if (!po) notFound();

  const units = po.lines.reduce((n, l) => n + l.qtyOrdered, 0);
  const costsKnown = po.lines.every((l) => l.unitCostFilsSnapshot > 0);

  return (
    <>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/purchasing"
            className="text-sm font-semibold text-text-muted hover:text-navy"
          >
            &larr; All purchase orders
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight tnum text-text">
            {po.poNumber}
            <StatusPill status={po.status} />
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {po.supplier.companyName} &middot; {po.supplier.primaryEmail}
          </p>
        </div>

        {po.status === "Draft" && (
          <div className="flex flex-wrap items-center gap-2">
            <SendButton id={po.id} poNumber={po.poNumber} />
            <CancelDraftButton id={po.id} poNumber={po.poNumber} />
          </div>
        )}
      </div>

      {!costsKnown && (
        <p className="mt-4 rounded-card border-l-4 border-accent-border bg-accent-soft px-4 py-2.5 text-sm font-semibold text-text">
          Some lines have no recorded cost, so the total below is not the real
          value of this order. Costs arrive with the catalogue upload — BE-34.
        </p>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
          <h2 className="text-base font-bold tracking-tight text-text">
            {po.lines.length} line{po.lines.length === 1 ? "" : "s"} &middot;{" "}
            {units} unit{units === 1 ? "" : "s"}
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            Quantities are pooled across every customer who ordered the item
            before the cutoff.
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm [&_.tnum]:whitespace-nowrap [&_td]:align-top [&_th]:whitespace-nowrap">
              <thead className="border-b border-border-strong text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
                <tr>
                  <th className="py-1.5">Their code</th>
                  <th className="py-1.5">Description</th>
                  <th className="py-1.5 text-right">Qty</th>
                  <th className="py-1.5 text-right">Unit cost</th>
                  <th className="py-1.5 text-right">Line cost</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((line) => (
                  <tr key={line.id} className="border-b border-border-base last:border-0">
                    <td className="py-2 tnum font-semibold text-text">
                      {line.supplierPartNumberSnapshot ?? (
                        <span className="text-text-subtle">not recorded</span>
                      )}
                    </td>
                    <td className="py-2 text-text-muted">
                      {line.nameSnapshot}
                      <span className="block text-xs text-text-subtle tnum">
                        our code {line.skuCodeSnapshot}
                        {line.wasFallback && (
                          <span className="ml-1.5 font-bold text-accent">
                            backup supplier
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-2 text-right tnum font-bold text-text">
                      {line.qtyOrdered}
                    </td>
                    <td className="py-2 text-right tnum text-text-muted">
                      {line.unitCostFilsSnapshot > 0
                        ? aed(line.unitCostFilsSnapshot)
                        : "—"}
                    </td>
                    <td className="py-2 text-right tnum text-text">
                      {line.lineCostFils > 0 ? aed(line.lineCostFils) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-3 text-right font-bold text-text">
                    Total
                  </td>
                  <td className="pt-3 text-right font-bold tnum text-text">
                    {po.totalCostFils > 0 ? aed(po.totalCostFils) : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              Supplier
            </h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label="Company" value={po.supplier.companyName} />
              <Row label="Orders to" value={po.supplier.primaryEmail} />
              <Row label="Copy to" value={po.supplier.secondaryEmail} />
              <Row
                label="Promised lead time"
                value={
                  po.supplier.promisedLeadTimeDays
                    ? `${po.supplier.promisedLeadTimeDays} days`
                    : "not agreed"
                }
                warn={!po.supplier.promisedLeadTimeDays}
              />
            </dl>
          </section>

          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              Dates
            </h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label="Cutoff" value={dubai(po.cutoffAt)} />
              <Row label="Built" value={dubai(po.createdAt)} />
              <Row label="Sent" value={po.sentAt ? dubai(po.sentAt) : "—"} />
              <Row
                label="Acknowledged"
                value={po.acknowledgedAt ? dubai(po.acknowledgedAt) : "—"}
              />
              <Row
                label="Received"
                value={po.receivedAt ? dubai(po.receivedAt) : "—"}
              />
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-text-subtle">
              All times Dubai. Goods-in against this order is BE-37 and is not
              built yet, so nothing can be received here today.
            </p>
          </section>
        </div>
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
