import { NextResponse } from "next/server";
import { getDepartments, queryProducts } from "@/lib/catalog";

/**
 * GET /api/v1/categories
 *
 * The full two-level tree, each node carrying a live count of the products it
 * resolves to. Counts are computed from the same query that lists products —
 * the historical platform let admin counts and storefront counts diverge, and
 * deriving both from one source is what prevents that.
 *
 * Query: inStock=1 to count only available lines.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const inStockOnly = searchParams.get("inStock") === "1";

  const { facetCounts } = await queryProducts({ inStockOnly });

  const departments = (await getDepartments()).map((dept) => ({
    id: dept.id,
    name: dept.name,
    slug: dept.slug,
    productCount: facetCounts[dept.id] ?? 0,
    children: dept.children.map((child) => ({
      id: child.id,
      name: child.name,
      slug: child.slug,
      parentId: dept.id,
      productCount: facetCounts[child.id] ?? 0,
    })),
  }));

  return NextResponse.json({
    departments,
    totalCategories: departments.reduce(
      (sum, d) => sum + 1 + d.children.length,
      0
    ),
  });
}
