import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { buildTemplateWorkbook } from "@/lib/catalogue-workbook";

/**
 * GET /admin/products/upload/template
 *
 * The blank template, built fresh each time so it carries the suppliers and
 * categories that exist right now. A template listing a supplier who was
 * removed last month is how a spreadsheet full of unmatched rows happens.
 */
export async function GET() {
  await requireAdmin("products", "view");

  const [suppliers, categories] = await Promise.all([
    db.supplier.findMany({
      where: { status: "Active" },
      orderBy: { companyName: "asc" },
      select: { companyName: true },
    }),
    db.category.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const workbook = await buildTemplateWorkbook(
    suppliers.map((s) => s.companyName),
    categories.map((c) => c.name)
  );

  const today = new Date().toISOString().slice(0, 10);

  return new Response(new Uint8Array(workbook), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="aussiemed-catalogue-template-${today}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
