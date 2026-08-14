
import type { Product } from "./types";

/**
 * Serialisation for the /api/v1 surface.
 *
 * Kept apart from the internal Product type on purpose: the API is a contract
 * the backend will have to reproduce, so it should not drift every time an
 * internal field is renamed. Money is emitted as a number with two decimals
 * and the currency stated once on the envelope — never a pre-formatted string
 * and never a localised symbol.
 */

export type ProductSummary = ReturnType<typeof toProductSummary>;

export function toProductSummary(product: Product, supplierName: string) {
  return {
    id: product.id,
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    unit: product.unit,
    packSize: product.packSize,
    priceAED: product.priceAED,
    tiers: product.tiers,
    outOfStock: product.outOfStock,
    categoryId: product.categoryId,
    categoryPath: product.categoryPath,
    images: product.images,
    supplier: {
      id: product.supplierId,
      name: supplierName,
    },
    /** Seed data invented during the rebuild — never ship these live. */
    isPlaceholder: product.isPlaceholder,
  };
}

export function toProductDetail(product: Product, supplierName: string) {
  return {
    ...toProductSummary(product, supplierName),
    description: product.description,
    /** Original ASP.NET identifier, retained for reconciliation. */
    legacyDetailKey: product.detailKey,
  };
}

export function notFound(message: string) {
  return Response.json({ error: { code: "not_found", message } }, { status: 404 });
}

export function badRequest(message: string) {
  return Response.json(
    { error: { code: "bad_request", message } },
    { status: 400 }
  );
}
