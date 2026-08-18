import type { Product, SnapshotProduct } from "./types";

/**
 * What the browser is given of the catalogue, and nothing more.
 *
 * A browser cannot query the database, so client components — the cart, the
 * saved list, the search typeahead — read one snapshot of every product. That
 * was 3KB a product, and filling the category tree took the catalogue from 60
 * products to 787: 854KB on every first page load, most of it prose nothing on
 * the client ever renders.
 *
 * So the snapshot carries the fields the browser actually reads and drops the
 * rest. What goes:
 *
 *   description   164KB, and only the server-rendered product page shows it.
 *   attributes    the spec table, again server-rendered.
 *   documents     SDS and spec sheets, links on the product page.
 *   variants      the size and colour axes, rendered on the product page.
 *   familyMembers the sibling dropdown, resolved server-side per product.
 *   badges        computed for listings, which the server renders.
 *   tiers         a copy of the default pack's breaks; packs carry their own.
 *   images        all but the first: a cart line shows one thumbnail.
 *   isPlaceholder / detailKey / sourceNote — notices on the product page.
 *
 * This is not BE-10. The endpoint still exists and the browser still holds a
 * catalogue; it holds a smaller one. BE-10 is retiring it altogether once the
 * cart moves server-side, and the case for that got stronger, not weaker.
 *
 * Pure and tested so the shape cannot quietly grow back: it is easy to add a
 * field to Product and never notice it has joined a payload every visitor
 * downloads.
 */
export function toSnapshot(product: Product): SnapshotProduct {
  return {
    id: product.id,
    skuId: product.skuId,
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    priceAED: product.priceAED,
    unit: product.unit,
    // Read by the search: "gloves 100" should find a pack size as well as a name.
    packSize: product.packSize,
    outOfStock: product.outOfStock,
    taxClass: product.taxClass,
    // One image, for a cart line's thumbnail. The gallery is server-rendered.
    images: product.images.slice(0, 1),
    // Slugs are dropped: the browser matches category names when searching and
    // ids when finding related products, and never links to a category from
    // anything the snapshot feeds.
    categoryPath: product.categoryPath.map((c) => ({ id: c.id, name: c.name })),
    packs: product.packs.map((pack) => ({
      id: pack.id,
      sku: pack.sku,
      label: pack.label,
      shortLabel: pack.shortLabel,
      eachesPerPack: pack.eachesPerPack,
      priceAED: pack.priceAED,
      outOfStock: pack.outOfStock,
      // Kept: a cart line prices itself against the breaks as quantity changes,
      // and dropping them would make the cart disagree with the product page.
      tiers: pack.tiers,
    })),
    defaultPackId: product.defaultPackId,
  };
}

export function toSnapshotList(products: Product[]): SnapshotProduct[] {
  return products.map(toSnapshot);
}
