import { notFound } from "next/navigation";
import { getOrderByReference } from "@/lib/orders";
import { getSessionUser } from "@/lib/auth";
import { readCartKey } from "@/lib/cart-cookie";
import { PrintButton } from "@/components/account/PrintButton";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { includedInPackingList } from "@/lib/consignment-maths";

export default async function ShipmentPackingList({ params }: { params: Promise<{ reference: string; sequence: string }> }) {
  const { reference, sequence } = await params;
  const order = await getOrderByReference(reference);
  if (!order) notFound();
  const user = await getSessionUser();
  if (user?.role === "Admin") await requireAdmin("orders", "view");
  const cartKey = await readCartKey();
  if (user?.role !== "Admin" && !(user && order.userId === user.id) && !(!order.userId && cartKey && order.guestCartKey === cartKey)) notFound();
  const batch = order.shipments.find(shipment => String(shipment.sequence) === sequence);
  if (!batch) notFound();
  const sentThrough = new Map<string, number>();
  for (const shipment of order.shipments) if (includedInPackingList(shipment, batch.sequence, batch.dispatchedAt ?? batch.createdAt)) for (const line of shipment.lines) sentThrough.set(line.orderItemId, (sentThrough.get(line.orderItemId) ?? 0) + line.qty);
  const remainder = order.items.filter(item => item.status !== "Cancelled").map(item => ({ ...item, remaining: Math.max(0, item.qty - (sentThrough.get(item.id) ?? 0)) })).filter(item => item.remaining > 0);
  return <article className="mx-auto max-w-4xl px-4 py-8 text-text">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden"><Link href={`/orders/${reference}`} className="text-sm text-navy underline">Back to order</Link><PrintButton /></div>
    <h1 className="text-2xl font-bold">AussieMed packing list</h1>
    <p className="mt-2 font-semibold">{reference} - Shipment {batch.sequence}</p>
    <p className="mt-1 text-sm">{batch.dispatchedAt ? `Dispatched ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai" }).format(batch.dispatchedAt)}` : "Prepared - not yet dispatched"}</p>
    <p className="mt-2 break-words text-sm">{batch.courier}{batch.trackingNumber ? ` - Tracking: ${batch.trackingNumber}` : ""}</p>
    <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-y border-border-strong"><th className="py-2 pr-3">Item</th><th className="py-2 pr-3">Pack</th><th className="py-2 text-right">This shipment</th></tr></thead><tbody>
      {batch.lines.map(line => { const item = order.items.find(item => item.id === line.orderItemId)!; return <tr key={line.id} className="border-b border-border-base"><td className="py-3 pr-3">{item.nameSnapshot}<span className="block text-xs">{item.skuCodeSnapshot}</span></td><td className="py-3 pr-3">{item.unitLabelSnapshot}</td><td className="py-3 text-right font-semibold">{line.qty}</td></tr>; })}
    </tbody></table></div>
    {remainder.length > 0 && <section className="mt-8 border-t border-border-strong pt-4"><h2 className="font-bold">Not included in this shipment - to follow</h2><ul className="mt-3 space-y-2 text-sm">{remainder.map(item => <li key={item.id} className="flex justify-between gap-4"><span>{item.nameSnapshot}</span><span>{item.remaining}</span></li>)}</ul></section>}
  </article>;
}
