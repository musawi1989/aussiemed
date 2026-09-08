import Link from "next/link";
import { inboundProducts } from "@/lib/inbound";
import { AllocateGoods } from "@/components/admin/AllocateGoods";
import { EntityLogo } from "@/components/EntityLogo";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { clientKey, clientName } from "@/lib/client-grouping";
export default async function InboundPage() {
  const receipts = await inboundProducts();
  const suppliers = Map.groupBy(receipts, r => r.purchaseOrderLine.purchaseOrder.supplier.id);
  return <div className="mt-5"><h1 className="text-xl font-bold">Received products</h1><p className="mt-1 text-sm text-text-muted">{receipts.reduce((n,r) => n+r.remaining,0)} units awaiting allocation</p>
    {!receipts.length && <p className="mt-6">No unallocated received products.</p>}
    {[...suppliers.entries()].map(([id, rows]) => {
      const deliveries = rows.flatMap(receipt => receipt.purchaseOrderLine.allocations.map(a => ({ receipt, item: a.orderItem }))).filter(({item}) => !["Cancelled","Delivered"].includes(item.order.status) && !["Cancelled","Shipped"].includes(item.status));
      const unique = [...new Map(deliveries.map(d => [`${d.receipt.id}:${d.item.id}`, d])).values()];
      const buyers = Map.groupBy(unique, d => clientKey(d.item.order));
      return <details key={id} className="mt-5 rounded-card border border-border-base p-4"><summary className="cursor-pointer font-bold"><EntityLogo kind="supplier" id={id} name={rows[0].purchaseOrderLine.purchaseOrder.supplier.companyName} />{rows[0].purchaseOrderLine.purchaseOrder.supplier.companyName} · {rows.reduce((n,r)=>n+r.remaining,0)} units</summary>
        {[...buyers.entries()].map(([key, deliveries]) => { const buyer = deliveries[0].item.order; const name = clientName(buyer); return <details key={key} className="ml-4 mt-4 border-t border-border-base pt-3"><summary className="cursor-pointer font-semibold"><EntityLogo kind={buyer.organisationId ? "organisation" : "user"} id={buyer.organisationId ?? buyer.userId} name={name} />{name} · {new Set(deliveries.map(d=>d.item.order.id)).size} orders</summary>
          {[...Map.groupBy(deliveries,d=>d.item.order.reference)].map(([reference, lines]) => <div key={reference} className="mt-3 rounded border border-border-base p-3"><Link className="font-bold text-navy underline" href={`/admin/orders/${reference}`}>Order {reference}</Link>
            {lines.map(({receipt:r,item}) => { const line = r.purchaseOrderLine; const allocated=item.goodsAllocations.reduce((n,a)=>n+a.qty,0); const sent=item.shipmentLines.filter(l=>l.shipment.dispatchedAt).reduce((n,l)=>n+l.qty,0); const reserved=line.allocations.filter(a=>a.orderItemId===item.id).reduce((n,a)=>n+a.qty,0); const assigned=item.goodsAllocations.filter(a=>a.receipt.purchaseOrderLineId===line.id).reduce((n,a)=>n+a.qty,0); const needed=Math.max(0,Math.min(item.qty-Math.max(allocated,sent),reserved-assigned)); return <div key={`${r.id}:${item.id}`} className="flex flex-wrap items-center justify-between gap-3 border-t border-border-base py-3"><div><ProductThumbnail skuCode={line.skuCodeSnapshot} name={line.nameSnapshot} /><span className="font-semibold">{line.nameSnapshot}</span><p className="mt-1 text-xs">{r.remaining} available · {needed} still needed · <Link className="underline" href={`/admin/purchasing/${line.purchaseOrder.poNumber}`}>{line.purchaseOrder.poNumber}</Link></p></div>{needed>0 && <AllocateGoods key={`${r.id}-${item.id}-${r.remaining}-${allocated}`} receiptId={r.id} orderItemId={item.id} max={Math.min(r.remaining,needed)} />}</div>; })}
          </div>)}
        </details>; })}
        {!buyers.size && <p className="mt-4">These goods have no open customer orders awaiting allocation.</p>}
      </details>;
    })}
  </div>;
}
