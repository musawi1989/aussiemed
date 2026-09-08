import Link from "next/link";
import { notFound } from "next/navigation";
import { getPurchaseOrder, myDocketPlan } from "@/lib/supplier-portal";
import { supplierPermissions } from "@/lib/permissions";
import { supplierWork } from "@/lib/supplier-work-maths";
import { courierOptions } from "@/lib/couriers";
import { StatusPill } from "@/components/StatusPill";
import { DocketEditor } from "@/components/DocketEditor";
import { InvoicePaymentHistory } from "@/components/InvoicePaymentHistory";
import { ConfirmQuantities } from "@/components/portal/ConfirmQuantities";
import { AcknowledgeButton, DispatchForm } from "@/components/portal/PurchaseOrderActions";

export default async function SupplierPurchaseOrderPage({ params }: { params: Promise<{ poNumber: string }> }) {
  const { poNumber } = await params;
  const po = await getPurchaseOrder(poNumber);
  if (!po) notFound();
  const plan = await myDocketPlan(po.poNumber);
  const perms = await supplierPermissions();
  const couriers = await courierOptions(po.courier);
  const done = ["Received", "Cancelled"].includes(po.status);
  const work = po.lines.map(line => ({ ...line, work: supplierWork(line) }));
  const pending = work.filter(line => line.work.outstanding > 0);
  const ready = pending.reduce((n, line) => n + line.work.ready, 0);
  const backordered = pending.reduce((n, line) => n + line.work.backordered, 0);
  return <>
    <Link href="/business-portal" className="text-sm font-semibold underline">All outstanding products</Link>
    <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-bold">{po.poNumber}</h1><div className="mt-2"><StatusPill axis="fulfilment" status={po.status} /></div></div>
      {!done && !po.acknowledgedAt && perms.acknowledgeOrders !== "off" && <AcknowledgeButton id={po.id} poNumber={po.poNumber} />}
    </div>
    {!done && <section className="mt-5 border-b border-border-base pb-5">
      <h2 className="text-lg font-bold">To dispatch ({ready})</h2>
      {perms.markDispatched !== "off" && plan && !plan.complete && plan.lines.some(line => line.outstanding > 0) ? <DispatchForm
        key={plan.dockets.length + "-" + work.map(l => l.qtyConfirmed + ":" + l.qtyOrdered).join(",")}
        id={po.id} poNumber={po.poNumber} courier={null} courierOptions={couriers} trackingNumber={null}
        lines={plan.lines.filter(line => line.outstanding > 0).map(line => ({
          id: line.id, code: line.skuCode, name: line.name, qtyOrdered: line.qtyOrdered, outstanding: line.outstanding,
          suggested: work.find(l => l.id === line.id)?.work.ready ?? 0,
        })).sort((a, b) => Number(b.suggested > 0) - Number(a.suggested > 0))}
      /> : <p className="mt-3 text-sm text-text-muted">No quantities left to prepare.</p>}
      {plan?.dockets.filter(d => !d.dispatchedAt).map(d => <div key={d.id} className="mt-3 border-t border-border-base pt-3"><p className="text-sm font-bold">Prepared docket {d.sequence}</p><DocketEditor docket={d} /></div>)}
    </section>}
    {!done && perms.confirmQuantities !== "off" && pending.length > 0 && <section className="mt-5 border-b border-border-base pb-5">
      <h2 className="text-base font-bold">Availability and backorders ({backordered})</h2>
      <ConfirmQuantities key={work.map(l => [l.id, l.qtyOrdered, l.qtyConfirmed, l.work.sent].join(":")).join(",")} id={po.id} poNumber={po.poNumber}
        lines={pending.sort((a, b) => Number(a.work.backordered > 0) - Number(b.work.backordered > 0)).map(line => ({
          id: line.id, name: line.nameSnapshot, code: line.supplierPartNumberSnapshot ?? line.skuCodeSnapshot,
          qtyOrdered: line.qtyOrdered, qtyConfirmed: line.work.ready + line.work.sent + line.work.prepared, alreadySent: line.work.sent + line.work.prepared,
        }))}
      />
    </section>}
    <section className="mt-5">
      <h2 className="text-base font-bold">Dispatch history</h2>
      {!plan?.dockets.length && <p className="mt-3 text-sm text-text-muted">No dispatches recorded.</p>}
      {plan?.dockets.filter(d => d.dispatchedAt).map(d => <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border-base py-4">
        <div className="text-sm"><p className="font-bold">Docket {d.sequence}: {d.units} units</p><p>{d.dispatchedAt?.toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}</p><p>{d.courier ?? "No courier"} | {d.trackingNumber ?? "No tracking number"}</p>
          <Link className="mt-2 inline-block font-bold underline" href={`/business-portal/orders/${encodeURIComponent(po.poNumber)}/docket/${d.sequence}`}>Print dispatch docket {d.sequence}</Link>
        </div>
        {perms.markDispatched !== "off" && <DocketEditor docket={d} />}
      </div>)}
    </section>
    <details className="mt-5 border-t border-border-base pt-4"><summary className="cursor-pointer text-sm font-bold">Order totals and receipts</summary>
      <table className="mt-3 w-full text-sm"><thead><tr className="text-left"><th>Product</th><th>Ordered</th><th>Sent</th><th>Received</th><th>Outstanding</th></tr></thead>
        <tbody>{work.map(line => <tr key={line.id} className="border-t border-border-base"><td className="py-2">{line.nameSnapshot}<p className="text-xs text-text-muted">{line.skuCodeSnapshot}</p></td><td>{line.qtyOrdered}</td><td>{line.work.sent}</td><td>{line.qtyReceived}</td><td>{line.work.outstanding}</td></tr>)}</tbody>
      </table>
      <Link href={`/business-portal/orders/${encodeURIComponent(po.poNumber)}/packing-list`} className="mt-3 inline-block text-sm underline">Print full purchase-order packing list</Link>
    </details>
    <InvoicePaymentHistory entries={po.payments} />
  </>;
}
