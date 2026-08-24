import Link from "next/link";
import { db } from "@/lib/db";
import { UrlFilters } from "@/components/UrlFilters";
import { unallocatedProducts } from "@/lib/supply-offers";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { PRODUCT_TABS } from "../tabs";

/**
 * Items nobody is allocated to supply.
 *
 * NOT the same question as Cover's "no primary" filter, which finds items
 * where the primary slot is empty but somebody may still hold the backup.
 * These have no cover at all: the buying run reaches them and has nowhere to
 * go, and the first anybody hears of it is a customer order that cannot be
 * sourced.
 *
 * OFFERS ARE SHOWN BESIDE EACH ONE, because the answer is often already on the
 * screen. A supplier who has added an item to their own list has told us they
 * can supply it; allocating them takes one click from here rather than a hunt
 * through the Cover screen.
 */
export default async function UnallocatedProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoryId?: string }>;
}) {
  const filters = await searchParams;

  const [products, categories] = await Promise.all([
    unallocatedProducts(filters),
    db.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const withOffers = products.filter((p) => p.offers.length > 0);

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">Products</h1>
      </div>

      <SectionTabs tabs={PRODUCT_TABS} />

      <div className="mt-5">
        <h2 className="text-base font-bold tracking-tight text-text">
          Products with no supplier
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Nobody is allocated to supply these, at either rank. A customer order
          for one of them reaches the buying run with nowhere to go.
        </p>
        <p className="mt-2 text-sm tnum text-text-muted">
          {products.length === 0
            ? "Every active item has a supplier"
            : `${products.length} ${products.length === 1 ? "item" : "items"}` +
              (withOffers.length > 0
                ? ` · ${withOffers.length} already offered by a supplier`
                : "")}
        </p>
      </div>

      <UrlFilters
        basePath="/admin/products/unallocated"
        searchName="q"
        searchValue={filters.q ?? ""}
        searchPlaceholder="Item name"
        selects={[
          {
            name: "categoryId",
            label: "Category",
            allLabel: "All categories",
            value: filters.categoryId ?? "",
            options: categories.map((c) => ({ value: c.id, label: c.name })),
          },
        ]}
      />

      {products.length === 0 ? (
        <p className="mt-5 rounded-card border border-border-base bg-surface px-4 py-12 text-center text-sm text-text-muted shadow-card">
          Every active item has a supplier at one rank or the other.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-border-base bg-surface shadow-card">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-base text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Offered by</th>
                <th className="px-3 py-2 text-right">Allocate</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.skuId}
                  className="border-b border-border-base last:border-0"
                >
                  <td className="px-3 py-2">
                    <span className="block font-semibold text-text">
                      {product.name}
                    </span>
                    <span className="block text-xs text-text-subtle">
                      {product.unitLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2 tnum text-text-muted">
                    {product.skuCode}
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {product.categoryName ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {product.offers.length === 0 ? (
                      <span className="text-xs text-text-subtle">nobody yet</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {product.offers.map((offer) => (
                          <span
                            key={offer.supplierId}
                            className="rounded-full bg-navy-soft px-2 py-0.5 text-xs font-semibold text-navy"
                            title="This supplier has told us they can supply it"
                          >
                            {offer.supplierName}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {/* Straight to the Cover screen, filtered to this one item.
                        Allocating is one job with one screen; a second set of
                        rank selects here would be the same decision in two
                        places, free to disagree. */}
                    <Link
                      href={`/admin/suppliers/cover?q=${encodeURIComponent(product.skuCode)}`}
                      className="rounded-card border border-border-strong bg-surface px-3 py-1.5 text-sm font-bold text-text transition-colors hover:border-navy hover:text-navy"
                    >
                      Allocate
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
