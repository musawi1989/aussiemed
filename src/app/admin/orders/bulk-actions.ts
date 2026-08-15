"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, setOrderStatus, setOrderLineStatus } from "@/lib/admin";
import { db } from "@/lib/db";

/**
 * Bulk actions from the orders list.
 *
 * Each order still goes through setOrderStatus one at a time rather than a
 * single updateMany, so the transition rules and the audit entry apply to
 * every one of them. A bulk action that skips the rules is how a delivered
 * order quietly gets reopened.
 */
export async function bulkSetOrderStatus(
  references: string[],
  status: string
): Promise<{ changed: number; refused: { reference: string; why: string }[] }> {
  await requireAdmin();

  let changed = 0;
  const refused: { reference: string; why: string }[] = [];

  for (const reference of references) {
    const result = await setOrderStatus(reference, status);
    if (result.ok) changed += 1;
    else refused.push({ reference, why: result.error });
  }

  revalidatePath("/admin/orders");
  revalidatePath("/admin/orders/board");
  revalidatePath("/admin");
  return { changed, refused };
}

export async function setLineStatusAction(
  itemId: string,
  status: string,
  reference: string
): Promise<{ ok: boolean; error?: string }> {
  const result = await setOrderLineStatus(itemId, status);
  if (result.ok) {
    revalidatePath(`/admin/orders/${reference}`);
    revalidatePath("/admin/orders");
  }
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/**
 * The export is generated here rather than by a route handler so it runs under
 * the same admin check as everything else. Orders are customer records; an
 * unauthenticated CSV endpoint would hand the whole book to anyone who found
 * the URL.
 */
export async function exportOrdersCsv(references: string[]): Promise<string> {
  await requireAdmin();

  const orders = await db.order.findMany({
    where: references.length > 0 ? { reference: { in: references } } : {},
    orderBy: { placedAt: "desc" },
    take: references.length > 0 ? undefined : 5000,
    include: {
      user: { select: { name: true, email: true, phone: true } },
      organisation: { select: { name: true, trn: true, paymentTerms: true } },
      invoices: { include: { supplier: { select: { companyName: true } } } },
      items: true,
    },
  });

  const money = (fils: number) => (fils / 100).toFixed(2);

  const header = [
    "Order",
    "Created",
    "Placed",
    "Customer",
    "Organisation",
    "Email",
    "Phone",
    "TRN",
    "Terms",
    "Status",
    "Paid",
    "Suppliers",
    "Lines",
    "Subtotal AED",
    "Zero rated AED",
    "VAT AED",
    "Total AED",
    "PO number",
    "Internal notes",
  ];

  /**
   * A product name containing a comma is the classic way an export silently
   * shifts every column after it. Quote everything and double the quotes.
   */
  const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  const rows = orders.map((order) => {
    const zeroRated = order.items
      .filter((i) => i.taxClassSnapshot === "ZeroRated")
      .reduce((n, i) => n + i.lineTotalFils, 0);

    return [
      order.reference,
      order.placedAt.toISOString().slice(0, 10),
      order.placedAt.toISOString().slice(0, 10),
      order.user?.name ?? "Guest",
      order.organisation?.name ?? "",
      order.user?.email ?? "",
      order.user?.phone ?? "",
      order.organisation?.trn ?? "",
      order.organisation?.paymentTerms ?? "",
      order.status,
      order.paymentStatus ?? "",
      order.invoices.map((i) => i.supplier.companyName).join(" / "),
      order.items.length,
      money(order.subtotalFils),
      money(zeroRated),
      money(order.vatFils),
      money(order.totalFils),
      order.poReference ?? "",
      order.internalNotes ?? "",
    ].map(cell).join(",");
  });

  return [header.map(cell).join(","), ...rows].join("\r\n");
}
