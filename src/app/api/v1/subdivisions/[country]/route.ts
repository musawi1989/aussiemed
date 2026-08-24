import { NextResponse } from "next/server";
import subdivisions from "@/data/subdivisions.json";
import { countryByCode, subdivisionLabel, subdivisionsOf } from "@/lib/geo";

/**
 * GET /api/v1/subdivisions/:country
 *
 * The states, provinces or governorates under one country, and the word that
 * country uses for them.
 *
 * WHY THIS IS A REQUEST RATHER THAN PART OF THE BUNDLE. All 152 countries have
 * a list now, which is about 3,300 entries. A country picker appears on the
 * sign-up form, at checkout, on a supplier and on a customer, so bundling the
 * lot would put 37KB of places nobody selected into four client components —
 * the weight problem BE-47 was raised about. One country is on screen at a
 * time, so one country is what crosses the wire.
 *
 * The seventeen curated countries in geo.ts are answered from there rather
 * than from the generated file, so this route and the form agree about what
 * an emirate is called. Those seventeen are also already in the bundle, so the
 * form never asks about them at all — this branch exists so the contract is
 * complete for anything else calling it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ country: string }> }
) {
  const { country } = await params;
  const code = country.trim().toUpperCase();

  // A country we do not offer is a 404, not an empty list. An empty list means
  // "this country has no subdivisions", which is a different and true thing
  // about Singapore, and a caller should be able to tell them apart.
  if (!countryByCode(code)) {
    return NextResponse.json(
      { error: "not_found", message: `No country with code ${code}.` },
      { status: 404 }
    );
  }

  const curated = subdivisionsOf(code);
  const generated = (subdivisions as Record<string, string[]>)[code] ?? [];
  const items = curated.length > 0 ? curated : generated;

  return NextResponse.json(
    {
      country: code,
      label: subdivisionLabel(code),
      /** Whether these were curated by hand or generated — see geo.ts. */
      source: curated.length > 0 ? "curated" : "generated",
      count: items.length,
      items,
    },
    {
      // Immutable for practical purposes: a country's provinces change on the
      // timescale of constitutional reform, not of a deploy.
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" },
    }
  );
}
