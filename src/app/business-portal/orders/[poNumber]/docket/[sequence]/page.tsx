import { notFound } from "next/navigation";
import { getPurchaseOrder } from "@/lib/supplier-portal";
import { loadDocket } from "@/lib/dockets";
import { DeliveryDocket } from "@/components/DeliveryDocket";

/**
 * One delivery docket, as the supplier prints it for the box.
 *
 * Scoped through getPurchaseOrder, which puts the session supplier id into the
 * lookup rather than checking it afterwards — another supplier's number does
 * not resolve at all, so there is no branch here that could be forgotten.
 */
export default async function SupplierDocketPage({
  params,
}: {
  params: Promise<{ poNumber: string; sequence: string }>;
}) {
  const { poNumber, sequence } = await params;

  const po = await getPurchaseOrder(decodeURIComponent(poNumber));
  if (!po) notFound();

  // Parsed rather than trusted: a sequence out of the URL is a number from a
  // stranger, and Number("2x") is NaN rather than an error.
  const n = Number(sequence);
  if (!Number.isInteger(n) || n < 1) notFound();

  const doc = await loadDocket(po.id, n);
  if (!doc) notFound();

  return (
    <DeliveryDocket
      audience="supplier"
      backHref={`/business-portal/orders/${encodeURIComponent(po.poNumber)}`}
      doc={doc}
    />
  );
}
