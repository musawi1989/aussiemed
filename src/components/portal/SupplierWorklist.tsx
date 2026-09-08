import Link from "next/link";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/supplier-portal";
import { supplierWork } from "@/lib/supplier-work-maths";

export async function SupplierWorklist() {
  const actor = await requireSupplier();
  const lines = await db.purchaseOrderLine.findMany({
    where: { purchaseOrder: { supplierId: actor.supplierId, status: { notIn: ["Draft", "Cancelled", "Received"] } } },
    select: {
      skuId: true, nameSnapshot: true, skuCodeSnapshot: true, qtyOrdered: true, qtyConfirmed: true, qtyReviewed: true, qtyReceived: true,
      purchaseOrder: { select: { poNumber: true } },
      docketLines: { select: { qty: true, docket: { select: { dispatchedAt: true } } } },
    },
  });
  const groups = [...Map.groupBy(lines, line => line.skuId).values()].map(rows => ({
    name: rows[0].nameSnapshot, code: rows[0].skuCodeSnapshot,
    rows: rows.map(line => ({ po: line.purchaseOrder.poNumber, ...supplierWork(line) })).filter(row => row.outstanding > 0),
  })).filter(group => group.rows.length);
  return <section className="mt-5 border-b border-border-base pb-5">
    <h2 className="text-lg font-bold">To dispatch</h2>
    <WorkRows groups={groups} kind="ready" />
    <details open className="mt-5 border-t border-border-base pt-3">
      <summary className="cursor-pointer text-sm font-bold">Backordered ({groups.reduce((n, g) => n + g.rows.reduce((m, r) => m + r.backordered, 0), 0)})</summary>
      <WorkRows groups={groups} kind="backordered" />
    </details>
    {groups.some(g => g.rows.some(r => r.prepared > 0)) && <details className="mt-3"><summary className="cursor-pointer text-sm font-bold">Prepared, awaiting dispatch</summary><WorkRows groups={groups} kind="prepared" /></details>}
  </section>;
}
type Group = { name: string; code: string; rows: { po: string; ready: number; backordered: number; prepared: number }[] };
function WorkRows({ groups, kind }: { groups: Group[]; kind: "ready" | "backordered" | "prepared" }) {
  const matching = groups.filter(g => g.rows.some(r => r[kind] > 0));
  if (!matching.length) return <p className="py-3 text-sm text-text-muted">{kind === "ready" ? "No products ready to dispatch." : "None outstanding."}</p>;
  return <div className="mt-2 overflow-auto"><table className="w-full min-w-[28rem] text-sm">
    <thead><tr className="border-b border-border-base text-left text-xs text-text-muted"><th className="py-2">Product</th><th className="py-2 text-right">Quantity</th><th className="py-2 pl-4">Purchase orders</th></tr></thead>
    <tbody>{matching.map(g => <tr key={g.code} className="border-b border-border-base">
      <td className="py-3 pr-3"><p className="font-semibold">{g.name}</p><p className="text-xs text-text-muted">{g.code}</p></td>
      <td className="py-3 text-right font-bold">{g.rows.reduce((n, r) => n + r[kind], 0)}</td>
      <td className="py-3 pl-4">{g.rows.filter(r => r[kind] > 0).map(r => <Link key={r.po} href={`/business-portal/orders/${encodeURIComponent(r.po)}`} className="block py-1 font-semibold underline">{r.po} ({r[kind]})</Link>)}</td>
    </tr>)}</tbody>
  </table></div>;
}
