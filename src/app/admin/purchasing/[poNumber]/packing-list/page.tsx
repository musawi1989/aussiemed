import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { SupplierPackingList } from "@/components/SupplierPackingList";

/**
 * Our copy of the sheet the supplier sends with the goods.
 *
 * The supplier can print it themselves from their portal; this exists because
 * not every supplier will, and somebody here needs to be able to send one or
 * hold one against a delivery that turned up without paperwork.
 *
 * The same component renders both, so the copy the warehouse checks against
 * and the copy the supplier fills in cannot drift into two different documents
 * with the same name.
 */
export default async function AdminSupplierPackingListPage({
  params,
}: {
  params: Promise<{ poNumber: string }>;
}) {
  await requireAdmin("purchasing", "view");
  const { poNumber } = await params;

  const po = await db.purchaseOrder.findUnique({
    where: { poNumber: decodeURIComponent(poNumber) },
    include: {
      lines: { orderBy: { skuCodeSnapshot: "asc" } },
      supplier: { select: { companyName: true } },
    },
  });
  if (!po) notFound();

  return (
    <SupplierPackingList
      audience="admin"
      backHref={`/admin/purchasing/${encodeURIComponent(po.poNumber)}`}
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
