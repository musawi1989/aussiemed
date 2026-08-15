import { NextResponse } from "next/server";
import { suggest } from "@/lib/catalog";
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

  return NextResponse.json({
    currency: "AED",
    query: q,
    items: (await suggest(q, limit)).map((p) => toProductSummary(p)),
  });
}
