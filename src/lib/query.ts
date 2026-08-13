import type { Product } from "./types";

/**
 * Catalogue querying as pure functions over a product array.
 *
 * Deliberately knows nothing about where products come from. Today
 * catalog.ts binds these to a JSON import; when the database lands it binds
 * them to query results instead, and none of this changes. It also means the
 * filtering, faceting and pagination rules are unit-testable without loading
 * the catalogue.
 */

export const PAGE_SIZE = 12;

export type SortKey = "relevance" | "name" | "price-asc" | "price-desc";

export type ProductQuery = {
  categorySlug?: string;
  brand?: string;
  q?: string;
  inStockOnly?: boolean;
  sort?: SortKey;
  page?: number;
};

export type ProductQueryResult = {
  items: Product[];
  total: number;
  page: number;
  pageCount: number;
  facetCounts: Record<number, number>;
  brands: { name: string; count: number }[];
};

/** Resolves a category slug to its id, or undefined if no such category. */
export type CategoryResolver = (slug: string) => { id: number } | undefined;

/** Every category id a product sits under, including its parent department. */
export function categoryIdsFor(product: Product): number[] {
  return product.categoryPath.map((node) => node.id);
}

export function matchesSearch(product: Product, needle: string): boolean {
  const haystack = [
    product.name,
    product.brand ?? "",
    product.sku,
    product.packSize ?? "",
    ...product.categoryPath.map((c) => c.name),
  ]
    .join(" ")
    .toLowerCase();

  // Every whitespace-separated term must appear somewhere — "nitrile large"
  // should not match a medium glove just because "nitrile" hit.
  return needle
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function sortProducts(items: Product[], sort: SortKey): Product[] {
  const sorted = [...items];
  switch (sort) {
    case "price-asc":
      sorted.sort((a, b) => a.priceAED - b.priceAED || a.name.localeCompare(b.name));
      break;
    case "price-desc":
      sorted.sort((a, b) => b.priceAED - a.priceAED || a.name.localeCompare(b.name));
      break;
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      // Relevance: in stock first, real products ahead of placeholders, then
      // alphabetical so the order is stable between renders.
      sorted.sort((a, b) => {
        if (a.outOfStock !== b.outOfStock) return a.outOfStock ? 1 : -1;
        if (a.isPlaceholder !== b.isPlaceholder) return a.isPlaceholder ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
  }
  return sorted;
}

export function queryProducts(
  products: Product[],
  resolveCategory: CategoryResolver,
  query: ProductQuery = {}
): ProductQueryResult {
  const { categorySlug, brand, q, inStockOnly, sort = "relevance" } = query;

  // Stage 1 — every filter EXCEPT the category facet.
  let base = products;
  if (q?.trim()) base = base.filter((p) => matchesSearch(p, q.trim()));
  if (brand) base = base.filter((p) => p.brand === brand);
  if (inStockOnly) base = base.filter((p) => !p.outOfStock);

  // Facet counts are derived from that same set, so a facet can never
  // advertise a number the list does not then deliver. This is the structural
  // fix for the old platform's counts-don't-match-results bug.
  const facetCounts: Record<number, number> = {};
  for (const product of base) {
    for (const id of categoryIdsFor(product)) {
      facetCounts[id] = (facetCounts[id] ?? 0) + 1;
    }
  }

  const brandCounts = new Map<string, number>();
  for (const product of base) {
    if (product.brand) {
      brandCounts.set(product.brand, (brandCounts.get(product.brand) ?? 0) + 1);
    }
  }
  const brands = [...brandCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Stage 2 — apply the category facet.
  let items = base;
  if (categorySlug) {
    const category = resolveCategory(categorySlug);
    if (!category) {
      return { items: [], total: 0, page: 1, pageCount: 1, facetCounts, brands };
    }
    items = items.filter((p) => categoryIdsFor(p).includes(category.id));
  }

  items = sortProducts(items, sort);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page ?? 1), pageCount);
  const start = (page - 1) * PAGE_SIZE;

  return {
    items: items.slice(start, start + PAGE_SIZE),
    total,
    page,
    pageCount,
    facetCounts,
    brands,
  };
}

export function suggestFrom(
  products: Product[],
  term: string,
  limit = 6
): Product[] {
  const needle = term.trim();
  if (needle.length < 2) return [];
  return products.filter((p) => matchesSearch(p, needle)).slice(0, limit);
}

export function relatedFrom(
  products: Product[],
  product: Product,
  limit = 4
): Product[] {
  const ids = new Set(categoryIdsFor(product));
  return products
    .filter(
      (p) => p.id !== product.id && categoryIdsFor(p).some((id) => ids.has(id))
    )
    .slice(0, limit);
}
