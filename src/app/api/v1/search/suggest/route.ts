import { NextResponse } from "next/server";
import { getSuppliers, suggest } from "@/lib/catalog";
import { toProductSummary } from "@/lib/api";

/**
 * GET /api/v1/search/suggest?q=&limit=
 *
 * Typeahead. Returns an empty list rather than an error for short terms, so
 * the caller can fire on every keystroke without special-casing.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get("limit") ?? "6", 10) || 6, 1),
    20
  );

  const suppliers = new Map((await getSuppliers()).map((s) => [s.id, s.name]));

  return NextResponse.json({
    currency: "AED",
    query: q,
    items: (await suggest(q, limit)).map((p) =>
      toProductSummary(p, suppliers.get(p.supplierId) ?? `Supplier ${p.supplierId}`)
    ),
  });
}
