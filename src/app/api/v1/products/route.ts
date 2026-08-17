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

  const asked = Number.parseInt(searchParams.get("page") ?? "1", 10) || 1;

  const query = {
    categorySlug: searchParams.get("category") ?? undefined,
    brand: searchParams.get("brand") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    inStockOnly: searchParams.get("inStock") === "1",
    sort: (searchParams.get("sort") as SortKey) ?? "relevance",
  };

  // The API stays paginated — it is a published v1 contract, and the
  // storefront's move to "view more" is a presentation change rather than a
  // contract change.
  //
  // An out-of-range page clamps to the last one rather than returning an empty
  // list, which is what it has always done and what the contract test asserts.
  // Clamping needs the total, and the total needs a query, so the rare
  // out-of-range request costs a second one — a fair price for never guessing
  // at a count.
  let result = await queryProducts({
    ...query,
    offset: (asked - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const page = Math.min(Math.max(1, asked), pageCount);

  if (page !== asked) {
    result = await queryProducts({
      ...query,
      offset: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    });
  }

  return NextResponse.json({
    currency: "AED",
    items: result.items.map((p) => toProductSummary(p)),
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      pageCount,
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
