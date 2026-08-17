import Link from "next/link";
import { db } from "@/lib/db";
import { TAX_CLASSES } from "@/lib/admin";
import { NewProductForm } from "@/components/admin/NewProductForm";

/**
 * Adding one product by hand.
 *
 * The bulk upload covers a price list arriving as a spreadsheet. This covers
 * the other case, which had no answer at all until now: one new line, typed
 * in, usually while somebody is on the phone about it.
 */
export default async function NewProductPage() {
  const [brands, categories] = await Promise.all([
    db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.category.findMany({
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, parentId: true },
    }),
  ]);

  const departments = categories
    .filter((c) => c.parentId === null)
    .map((dept) => ({
      id: dept.id,
      name: dept.name,
      children: categories
        .filter((c) => c.parentId === dept.id)
        .map((child) => ({ id: child.id, name: child.name })),
    }));

  return (
    <>
      <div className="mt-6">
        <Link
          href="/admin/products"
          className="text-sm font-semibold text-text-muted hover:text-navy"
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
          departments={departments}
        />
      </div>
    </>
  );
}
