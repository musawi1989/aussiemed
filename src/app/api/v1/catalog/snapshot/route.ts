import { NextResponse } from "next/server";
import { getAllProducts, getSuppliers } from "@/lib/catalog";

/**
 * GET /api/v1/catalog/snapshot
 *
 * The whole active catalogue in one response, for client components that need
 * to resolve a product without a round trip per item — the cart, the wishlist,
 * the search typeahead.
 *
 * This exists because a browser cannot query the database. It is a stopgap
 * that suits a 71-product catalogue; once the catalogue is thousands of lines
 * the cart moves server-side (phase 3) and the typeahead hits
 * /api/v1/search/suggest instead, and this endpoint goes away.
 */
export async function GET() {
  const [products, suppliers] = await Promise.all([
    getAllProducts(),
    getSuppliers(),
  ]);

  return NextResponse.json(
    { currency: "AED", products, suppliers },
    {
      headers: {
        // Safe to cache briefly: the catalogue only changes on re-seed.
        "cache-control": "public, max-age=60, stale-while-revalidate=300",
      },
    }
  );
}
