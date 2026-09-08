import Link from "next/link";
import { db } from "@/lib/db";
import { TAX_CLASSES } from "@/lib/admin";
import { NewProductForm } from "@/components/admin/NewProductForm";
import { buildCategoryTree } from "@/lib/category-tree";
import { mayReach } from "@/lib/admin-team";

/**
 * Adding one product by hand.
 *
 * The bulk upload covers a price list arriving as a spreadsheet. This covers
 * the other case, which had no answer at all until now: one new line, typed
 * in, usually while somebody is on the phone about it.
 */
export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ supplierId?: string }> }) {
  const params = await searchParams;
  const suppliers = await mayReach("/admin/suppliers") ? await db.supplier.findMany({ where: { status: "Active" }, orderBy: { companyName: "asc" }, select: { id: true, companyName: true } }) : [];
  const [brands, categories] = await Promise.all([
    db.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.category.findMany({
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, parentId: true },
    }),
  ]);

  // The whole tree, to whatever depth it has — see the note on the edit page.
  const tree = buildCategoryTree(categories);

  return (
    <>
      <div className="mt-6">
        <Link
          href="/admin/products"
          className="inline-flex min-h-11 items-center gap-2 rounded-card border-2 border-navy bg-navy px-4 py-2 font-bold text-white text-sm"
        >
          &larr; All products
        </Link>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-text">
          New product
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Created as a draft. Nothing appears in the shop until you approve it,
          and you can add photographs and more pack sizes straight afterwards.
        </p>
      </div>

      <div className="mt-5 max-w-3xl">
        <NewProductForm
          brands={brands}
          taxClasses={[...TAX_CLASSES]}
          tree={tree}
          suppliers={suppliers}
          supplierId={suppliers.find(supplier => supplier.id === params.supplierId)?.id ?? (suppliers.length === 1 ? suppliers[0].id : "")}
        />
      </div>
    </>
  );
}
