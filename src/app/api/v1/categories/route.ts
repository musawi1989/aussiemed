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

  /**
   * Carried to whatever depth the tree has. Dental is three deep since DA-41 —
   * Dental > Endodontics > Hand Files — and a response that stopped at two
   * would quietly answer a different question to the one the storefront asks.
   */
  type Node = {
    id: number;
    name: string;
    slug: string;
    parentId?: number;
    productCount: number;
    children?: Node[];
  };

  const shape = (
    node: { id: number; name: string; slug: string; children?: { id: number; name: string; slug: string; children?: unknown[] }[] },
    parentId?: number
  ): Node => ({
    id: node.id,
    name: node.name,
    slug: node.slug,
    ...(parentId === undefined ? {} : { parentId }),
    productCount: facetCounts[node.id] ?? 0,
    ...(node.children && node.children.length > 0
      ? { children: node.children.map((child) => shape(child as never, node.id)) }
      : {}),
  });

  const departments = (await getDepartments()).map((dept) => shape(dept));

  return NextResponse.json({
    departments,
    // Counted through the whole tree, not the first two levels of it.
    totalCategories: departments.reduce(function count(sum, node): number {
      return (node.children ?? []).reduce(count, sum + 1);
    }, 0),
  });
}
