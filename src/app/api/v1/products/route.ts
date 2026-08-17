import { NextResponse } from "next/server";
import { PAGE_SIZE, queryProducts, type SortKey } from "@/lib/catalog";
import { toProductSummary } from "@/lib/api";

/**
 * GET /api/v1/products
 *
 * The contract the real backend must honour. Today it reads the JSON
 * catalogue; when Prisma lands, only the body of queryProducts changes and
 * this response shape stays identical.
 *
 * Query: category, brand, q, inStock=1, sort, page
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const page = Number.parseInt(searchParams.get("page") ?? "1", 10) || 1;
  const result = await queryProducts({
    categorySlug: searchParams.get("category") ?? undefined,
    brand: searchParams.get("brand") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    inStockOnly: searchParams.get("inStock") === "1",
    sort: (searchParams.get("sort") as SortKey) ?? "relevance",
    // The API stays paginated — it is a published v1 contract and the
    // storefront's move to "view more" is a presentation change, not a
    // contract change.
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  return NextResponse.json({
    currency: "AED",
    items: result.items.map((p) => toProductSummary(p)),
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      pageCount: Math.max(1, Math.ceil(result.total / PAGE_SIZE)),
      total: result.total,
    },
    facets: {
      // Counts come from the same query that produced `items`, so a facet can
      // never advertise a number the list does not deliver.
      categories: result.facetCounts,
      brands: result.brands,
    },
  });
}
