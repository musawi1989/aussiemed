"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, setProductStatus } from "@/lib/admin";
import { db } from "@/lib/db";

/**
 * Bulk actions from the products list — the sibling of orders/bulk-actions.ts.
 *
 * Orders had selection, a bulk status change and an export; products, the
 * longest list in the back office, had none of it. Somebody who learnt the
 * pattern on one screen found it missing on the other, and taking fifty
 * products off sale meant fifty page loads.
 *
 * ONE AT A TIME THROUGH setProductStatus, not a single updateMany. That
 * function refuses a product with no active SKU or no category, and writes the
 * audit entry and the catalogue bump. A bulk path that went straight to the
 * database would be a way to put a product on sale that the ordinary path
 * would have refused.
 */
export async function bulkSetProductStatus(
  ids: string[],
  status: string
): Promise<{ changed: number; refused: { name: string; why: string }[] }> {
  await requireAdmin("products");

  // Names for the refusals: an id in an error message tells nobody anything.
  const names = new Map(
    (
      await db.productMaster.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    ).map((p) => [p.id, p.name])
  );

  let changed = 0;
  const refused: { name: string; why: string }[] = [];

  for (const id of ids) {
    const result = await setProductStatus(id, status);
    if (result.ok) changed += 1;
    else refused.push({ name: names.get(id) ?? id, why: result.error });
  }

  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/products");
  return { changed, refused };
}

/**
 * The catalogue as a spreadsheet.
 *
 * Generated here rather than by a route handler so it runs under the same
 * admin check as everything else — see the note on the orders export.
 *
 * ⚠ NO COST AND NO MARGIN. Every other figure on this list is one a supplier
 * or a customer could be shown; cost is neither, and an export is the easiest
 * thing in the building to forward to the wrong person. Margin lives on the
 * product page behind its own admin-only query and stays there.
 */
export async function exportProductsCsv(ids: string[]): Promise<string> {
  await requireAdmin("products", "view");

  const products = await db.productMaster.findMany({
    where: ids.length > 0 ? { id: { in: ids } } : {},
    orderBy: { name: "asc" },
    take: ids.length > 0 ? undefined : 5000,
    select: {
      name: true,
      slug: true,
      status: true,
      taxClass: true,
      brand: { select: { name: true } },
      categories: { select: { category: { select: { name: true } } } },
      images: { select: { id: true } },
      documents: { select: { id: true } },
      skus: {
        where: { isActive: true },
        select: {
          skuCode: true,
          unitLabel: true,
          priceFils: true,
          manualOutOfStock: true,
          tiers: { select: { id: true } },
        },
      },
    },
  });

  const money = (fils: number) => (fils / 100).toFixed(2);

  /**
   * A product name containing a comma is the classic way an export silently
   * shifts every column after it — the defect that broke the old platform's
   * bulk upload. Quote everything and double the quotes.
   */
  const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  const header = [
    "Product",
    "Slug",
    "Status",
    "Brand",
    "Categories",
    "Tax class",
    "Packs",
    "SKU codes",
    "Cheapest pack AED",
    "Has volume breaks",
    "Images",
    "Documents",
    "Out of stock packs",
  ];

  const rows = products.map((p) => {
    // Ascending, so "cheapest pack" is the figure a buyer would first see.
    const prices = p.skus.map((s) => s.priceFils).sort((a, b) => a - b);

    return [
      p.name,
      p.slug,
      p.status,
      p.brand?.name ?? "",
      p.categories.map((c) => c.category.name).join(" | "),
      p.taxClass,
      p.skus.length,
      p.skus.map((s) => s.skuCode).join(" | "),
      prices.length > 0 ? money(prices[0]) : "",
      p.skus.some((s) => s.tiers.length > 0) ? "yes" : "no",
      p.images.length,
      p.documents.length,
      p.skus.filter((s) => s.manualOutOfStock).length,
    ]
      .map(cell)
      .join(",");
  });

  return [header.map(cell).join(","), ...rows].join("\n");
}
