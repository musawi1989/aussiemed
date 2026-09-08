import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { loadDocket } from "@/lib/dockets";
import { DeliveryDocket } from "@/components/DeliveryDocket";

/**
 * One delivery docket, as we see it.
 *
 * The same document the supplier prints — goods-in checking a box against the
 * paperwork inside it has to be reading the same sheet, or the check is
 * between two documents rather than between paper and pallet.
 */
export default async function AdminDocketPage({
  params,
}: {
  params: Promise<{ poNumber: string; sequence: string }>;
}) {
  await requireAdmin("purchasing", "view");

  const { poNumber, sequence } = await params;

  const po = await db.purchaseOrder.findUnique({
    where: { poNumber: decodeURIComponent(poNumber) },
    select: { id: true, poNumber: true },
  });
  if (!po) notFound();

  const n = Number(sequence);
  if (!Number.isInteger(n) || n < 1) notFound();

  const doc = await loadDocket(po.id, n);
  if (!doc) notFound();

  return (
    <DeliveryDocket
      audience="admin"
      backHref={`/admin/purchasing/${encodeURIComponent(po.poNumber)}`}
      doc={doc}
    />
  );
}
