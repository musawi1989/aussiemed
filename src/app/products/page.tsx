import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterPanel } from "@/components/FilterPanel";
import { Pagination } from "@/components/Pagination";
import { ProductCard } from "@/components/ProductCard";
import { SortSelect } from "@/components/SortSelect";
import { getCategoryBySlug, queryProducts, type SortKey } from "@/lib/catalog";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const categorySlug = one(params.category);
  const q = one(params.q);
  const category = categorySlug ? getCategoryBySlug(categorySlug) : undefined;

  // Unique title and description per filter state — the old site shipped the
  // same title and an empty description on every page.
  if (q) {
    return {
      title: `Search results for “${q}”`,
      description: `Products matching “${q}” at AussieMed — medical, dental and laboratory supplies with volume pricing, priced in AED excluding 5% VAT.`,
    };
  }

  if (category) {
    return {
      title: `${category.name} — Trade Supplies`,
      description: `Buy ${category.name.toLowerCase()} in trade quantities from AussieMed. Volume price breaks on every line, priced in AED excluding 5% VAT, delivered across the UAE.`,
    };
  }

  return {
    title: "All Products — Medical, Dental & Laboratory Supplies",
    description:
      "Browse the full AussieMed catalogue of medical, dental, laboratory and cleaning supplies. Volume pricing on every line, priced in AED excluding 5% VAT.",
  };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const params = {
    category: one(raw.category),
    brand: one(raw.brand),
    q: one(raw.q),
    inStock: one(raw.inStock),
    sort: one(raw.sort),
  };

  const page = Number.parseInt(one(raw.page) ?? "1", 10) || 1;

  const result = queryProducts({
    categorySlug: params.category,
    brand: params.brand,
    q: params.q,
    inStockOnly: params.inStock === "1",
    sort: (params.sort as SortKey) ?? "relevance",
    page,
  });

  const category = params.category ? getCategoryBySlug(params.category) : undefined;
  const heading = category?.name ?? (params.q ? `Results for “${params.q}”` : "All products");

  const from = (result.page - 1) * 12 + 1;
  const to = Math.min(result.page * 12, result.total);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-brand">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/products" className="hover:text-brand">
              Products
            </Link>
          </li>
          {category && (
            <>
              <li aria-hidden="true">/</li>
              <li className="text-text">{category.name}</li>
            </>
          )}
        </ol>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-base pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            {heading}
          </h1>
          <p className="mt-1 text-sm text-text-muted tnum">
            {result.total === 0
              ? "No products match these filters"
              : `Showing ${from}–${to} of ${result.total} products`}
          </p>
        </div>
        <Suspense fallback={null}>
          <SortSelect value={params.sort ?? "relevance"} />
        </Suspense>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside className="lg:sticky lg:top-40 lg:self-start">
          <FilterPanel
            params={params}
            facetCounts={result.facetCounts}
            brands={result.brands}
          />
        </aside>

        <div>
          {result.items.length === 0 ? (
            <div className="rounded-panel border border-border-base bg-surface p-10 text-center">
              <p className="text-text">Nothing matched those filters.</p>
              <Link
                href="/products"
                className="mt-3 inline-block text-sm font-medium text-brand hover:underline"
              >
                Clear all filters
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {result.items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              <div className="mt-8">
                <Pagination
                  page={result.page}
                  pageCount={result.pageCount}
                  params={params}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
