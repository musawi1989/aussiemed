import { NextResponse } from "next/server";
import { getAllProducts } from "@/lib/catalog";
import { toSnapshotList } from "@/lib/catalog-snapshot";

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
  // Products only. The supplier list used to travel with this payload, which
  // meant every visitor's browser held the name of every company AussieMed
  // buys from — see BE-38 and DEC-24.
  //
  // And only the fields the browser reads. Filling the category tree took this
  // payload from 60 products to 787, and most of its weight was product prose
  // that only the server-rendered page ever shows — see catalog-snapshot.ts.
  const products = toSnapshotList(await getAllProducts());

  return NextResponse.json(
    { currency: "AED", products },
    {
      headers: {
        // Safe to cache briefly: the catalogue only changes on re-seed.
        "cache-control": "public, max-age=60, stale-while-revalidate=300",
      },
    }
  );
}
