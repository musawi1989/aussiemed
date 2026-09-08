import Link from "next/link";
import type { getOrderByReference } from "@/lib/orders";

export function CustomerShipments({ order }: { order: NonNullable<Awaited<ReturnType<typeof getOrderByReference>>> }) {
  if (!order.shipments.length) return null;
  const sent = new Map<string, number>();
  for (const batch of order.shipments) if (batch.dispatchedAt) for (const line of batch.lines) sent.set(line.orderItemId, (sent.get(line.orderItemId) ?? 0) + line.qty);
  const remaining = order.items.filter(item => item.status !== "Cancelled").map(item => ({ ...item, remaining: Math.max(0, item.qty - (sent.get(item.id) ?? 0)) })).filter(item => item.remaining > 0);
  return <section className="mt-6 border-y border-border-base py-5">
    <h2 className="text-lg font-bold text-text">Shipments</h2>
    <div className="mt-3 divide-y divide-border-base">{order.shipments.map(batch => <article key={batch.id} className="py-4 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-text">Shipment {batch.sequence} <span className="text-sm font-normal text-text-muted">{batch.dispatchedAt ? `Dispatched ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai" }).format(batch.dispatchedAt)}` : "Being prepared"}</span></h3>
        <Link href={`/orders/${order.reference}/shipments/${batch.sequence}`} className="text-sm font-semibold text-navy underline">Packing list</Link>
      </div>
      {(batch.courier || batch.trackingNumber) && <p className="mt-1 break-words text-sm text-text-muted">{batch.courier}{batch.trackingNumber ? ` - Tracking: ${batch.trackingNumber}` : ""}</p>}
      <ul className="mt-2 space-y-1 text-sm">{batch.lines.map(line => <li key={line.id} className="flex justify-between gap-4"><span>{order.items.find(item => item.id === line.orderItemId)?.nameSnapshot}</span><span className="whitespace-nowrap font-semibold tnum">{line.qty} packs</span></li>)}</ul>
    </article>)}</div>
    {remaining.length > 0 && <div className="mt-3 border-t border-border-base pt-4"><h3 className="font-semibold text-text">Still to follow</h3><ul className="mt-2 space-y-1 text-sm">{remaining.map(item => <li key={item.id} className="flex justify-between gap-4"><span>{item.nameSnapshot}{item.status === "Backordered" ? " (backordered)" : ""}</span><span className="whitespace-nowrap tnum">{item.remaining} packs</span></li>)}</ul></div>}
  </section>;
}
