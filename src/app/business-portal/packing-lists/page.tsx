import Link from "next/link";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/supplier-portal";
import { paymentDay } from "@/lib/payment-ledger-maths";
import { PrintButton } from "@/components/account/PrintButton";

export default async function DailyPackingLists({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const actor = await requireSupplier();
  const requested = (await searchParams).date;
  const today = new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10);
  const date = requested && paymentDay(requested) ? requested : today;
  const from = paymentDay(date)!;
  const to = new Date(from.getTime() + 86400000);
  const dockets = await db.purchaseOrderDocket.findMany({
    where: { purchaseOrder: { supplierId: actor.supplierId, status: { not: "Draft" } }, OR: [
      { dispatchedAt: { gte: from, lt: to } }, { dispatchedAt: null, createdAt: { gte: from, lt: to } },
    ] },
    orderBy: [{ dispatchedAt: "asc" }, { sequence: "asc" }],
    select: { id: true, sequence: true, dispatchedAt: true, courier: true, trackingNumber: true,
      purchaseOrder: { select: { poNumber: true } },
      lines: { select: { id: true, qty: true, purchaseOrderLine: { select: { nameSnapshot: true, supplierPartNumberSnapshot: true, skuCodeSnapshot: true } } } },
    },
  });
  return <div className="py-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-bold text-text">Daily packing lists</h1><PrintButton /></div>
    <form method="get" className="mt-4 flex flex-wrap items-end gap-3 print:hidden"><label className="text-sm font-semibold">Dispatch date<input name="date" type="date" defaultValue={date} className="ml-3 rounded-card border border-border-strong bg-surface px-3 py-2" /></label><button className="rounded-card bg-navy px-4 py-2 text-sm font-semibold text-on-navy">Show</button></form>
    <p className="mt-4 text-sm text-text-muted">{date} - {dockets.length} consignments</p>
    {dockets.length === 0 && <p className="mt-5 text-sm text-text-muted">No consignments recorded for this day.</p>}
    {dockets.map(docket => <section key={docket.id} className="mt-6 border-t border-border-base pt-4 avoid-break">
      <div className="flex flex-wrap justify-between gap-2"><h2 className="text-base font-bold text-text">{docket.purchaseOrder.poNumber} - Docket {docket.sequence}</h2><Link className="text-sm font-semibold text-navy underline print:hidden" href={`/business-portal/orders/${encodeURIComponent(docket.purchaseOrder.poNumber)}/docket/${docket.sequence}`}>Open docket</Link></div>
      <p className="mt-1 break-words text-sm text-text-muted">{docket.dispatchedAt ? "Dispatched" : "Prepared"}{docket.courier ? ` - ${docket.courier}` : ""}{docket.trackingNumber ? ` - ${docket.trackingNumber}` : ""}</p>
      <table className="mt-3 w-full text-left text-sm"><thead><tr className="border-b border-border-base"><th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Item</th><th className="py-2 text-right">Quantity</th></tr></thead><tbody>{docket.lines.map(line => <tr key={line.id} className="border-b border-border-base"><td className="py-2 pr-3 break-all">{line.purchaseOrderLine.supplierPartNumberSnapshot ?? line.purchaseOrderLine.skuCodeSnapshot}</td><td className="py-2 pr-3">{line.purchaseOrderLine.nameSnapshot}</td><td className="py-2 text-right tnum">{line.qty}</td></tr>)}</tbody></table>
    </section>)}
  </div>;
}
