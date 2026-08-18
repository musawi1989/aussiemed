import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FilterPanel } from "@/components/FilterPanel";
import { ViewMore } from "@/components/ViewMore";
import { ProductCard } from "@/components/ProductCard";
import { SortSelect } from "@/components/SortSelect";
import { getCategoryBySlug, queryProducts, type SortKey } from "@/lib/catalog";
import { emptyMessage, emptyReason } from "@/lib/empty-state";
import { PAGE_SIZE } from "@/lib/query";
import { logSearch } from "@/lib/search-log";

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
  const category = categorySlug ? await getCategoryBySlug(categorySlug) : undefined;

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

  // How many to show, not which page. Everything already seen stays on
  // screen, so this only ever grows.
  const show = Math.max(
    PAGE_SIZE,
    Number.parseInt(one(raw.show) ?? "", 10) || PAGE_SIZE
  );

  const result = await queryProducts({
    categorySlug: params.category,
    brand: params.brand,
    q: params.q,
    inStockOnly: params.inStock === "1",
    sort: (params.sort as SortKey) ?? "relevance",
    offset: 0,
    limit: show,
  });

  // Recorded here rather than in the search box, because this is the only
  // place that knows how many results the term actually found — and a term
  // that found nothing is the whole point of keeping them. Deliberately not
  // awaited into the render path beyond this: it never throws, and a search
  // that fails to log still shows its results. See BE-32.
  await logSearch({
    term: params.q,
    resultCount: result.total,
    categoryScope: params.category ?? null,
  });

  const category = params.category
    ? await getCategoryBySlug(params.category)
    : undefined;
  const heading = category?.name ?? (params.q ? `Results for “${params.q}”` : "All products");

  const hasMore = result.items.length < result.total;

  // Why the list is empty decides what the page says. A category the site
  // advertises but does not stock yet is a different situation from filters
  // narrowed to nothing, and telling the first buyer to clear filters they
  // never set is how an empty page reads as broken. See DEC-27.
  const nothing =
    result.total === 0
      ? emptyMessage(
          emptyReason({
            category: params.category,
            q: params.q,
            brand: params.brand,
            inStock: params.inStock === "1",
          }),
          { categoryName: category?.name, q: params.q }
        )
      : null;

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
            {nothing
              ? nothing.title
              : `${result.total} ${result.total === 1 ? "product" : "products"}`}
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
          {nothing ? (
            <div className="rounded-panel border border-border-base bg-surface p-10 text-center">
              <h2 className="text-lg font-semibold text-text">{nothing.title}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">
                {nothing.body}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {nothing.primary && (
                  <Link
                    href={nothing.primary.href}
                    className="inline-block rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
                  >
                    {nothing.primary.label}
                  </Link>
                )}
                {nothing.secondary && (
                  <Link
                    href={nothing.secondary.href}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    {nothing.secondary.label}
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {result.items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              <div className="mt-8">
                <ViewMore
                  shown={result.items.length}
                  total={result.total}
                  hasMore={hasMore}
                  nextHref={`?${new URLSearchParams({
                    ...Object.fromEntries(
                      Object.entries(params).filter(([, v]) => Boolean(v)) as [
                        string,
                        string,
                      ][]
                    ),
                    show: String(show + PAGE_SIZE),
                  }).toString()}`}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
