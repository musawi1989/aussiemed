import { NextResponse } from "next/server";
import { getProductById, getProductBySlug, relatedProducts } from "@/lib/catalog";
import { notFound, toProductDetail, toProductSummary } from "@/lib/api";

/**
 * GET /api/v1/products/:idOrSlug
 *
 * Accepts either the numeric id or the slug, so links survive either form.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ idOrSlug: string }> }
) {
  const { idOrSlug } = await params;

  const numeric = Number.parseInt(idOrSlug, 10);
  const product =
    (await getProductBySlug(idOrSlug)) ??
    (Number.isNaN(numeric) ? undefined : await getProductById(numeric));

  if (!product) return notFound(`No product matching "${idOrSlug}"`);

  return NextResponse.json({
    currency: "AED",
    product: toProductDetail(product),
    related: (await relatedProducts(product)).map((p) => toProductSummary(p)),
  });
}
