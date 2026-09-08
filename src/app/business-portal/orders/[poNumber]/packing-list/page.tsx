import { notFound } from "next/navigation";
import { getPurchaseOrder } from "@/lib/supplier-portal";
import { SupplierPackingList } from "@/components/SupplierPackingList";

/**
 * The packing list a supplier prints and sends with the day's goods.
 *
 * On their side of the portal so they can get it themselves. Scoped by
 * getPurchaseOrder, which puts the supplier id into the lookup rather than
 * checking it afterwards, so another supplier's number does not resolve at all
 * — there is no branch here that could be forgotten.
 */
export default async function SupplierPackingListPage({
  params,
}: {
  params: Promise<{ poNumber: string }>;
}) {
  const { poNumber } = await params;
  const po = await getPurchaseOrder(decodeURIComponent(poNumber));
  if (!po) notFound();

  return (
    <SupplierPackingList
      audience="supplier"
      backHref={`/business-portal/orders/${encodeURIComponent(po.poNumber)}`}
      po={{
        poNumber: po.poNumber,
        supplierName: po.supplier.companyName,
        cutoffAt: po.cutoffAt,
        sentAt: po.sentAt,
        expectedAt: po.expectedAt,
        lines: po.lines.map((line) => ({
          supplierPartNumber: line.supplierPartNumberSnapshot,
          skuCode: line.skuCodeSnapshot,
          name: line.nameSnapshot,
          qtyOrdered: line.qtyOrdered,
          qtyConfirmed: line.qtyConfirmed,
        })),
      }}
    />
  );
}
