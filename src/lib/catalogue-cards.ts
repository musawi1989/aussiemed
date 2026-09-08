import type { Product } from "./types";

export function cardPriceKey(product: Product): string {
  return JSON.stringify([
    product.variantGroup || product.slug,
    product.brand,
    product.taxClass,
    product.packs.map((pack) => [pack.priceAED, pack.tiers.map((tier) => [tier.minQty, tier.priceAED])]),
  ]);
}

/** Keep SKU identities intact; only the browsing representation is grouped. */
export function distinctPriceCards(products: Product[]): Product[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    const key = cardPriceKey(product);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function expandVariantCards(products: Product[]): Product[] {
  return products.flatMap((product) => {
    const packs = [...new Map([...product.packs, ...product.combinations.flatMap(combination => combination.packs)].map(pack => [pack.id, pack])).values()];
    if (packs.length < 2) return [product];
    return packs.map((pack) => {
      return {
        ...product,
        packs: [pack],
        defaultPackId: pack.id,
        priceAED: pack.priceAED,
        sku: pack.sku,
        tiers: pack.tiers,
        unit: pack.shortLabel,
        outOfStock: pack.outOfStock ?? product.outOfStock,
        images: pack.images?.length ? pack.images : product.genericImages ?? product.images,
      };
    });
  });
}
