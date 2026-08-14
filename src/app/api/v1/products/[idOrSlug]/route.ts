import { NextResponse } from "next/server";
import {
  getProductById,
  getProductBySlug,
  getSuppliers,
  relatedProducts,
} from "@/lib/catalog";
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

  const suppliers = new Map((await getSuppliers()).map((s) => [s.id, s.name]));
  const nameFor = (id: number) => suppliers.get(id) ?? `Supplier ${id}`;

  return NextResponse.json({
    currency: "AED",
    product: toProductDetail(product, nameFor(product.supplierId)),
    related: (await relatedProducts(product)).map((p) =>
      toProductSummary(p, nameFor(p.supplierId))
    ),
  });
}
