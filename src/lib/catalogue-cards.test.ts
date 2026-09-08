import test from "node:test";
import assert from "node:assert/strict";
import { distinctPriceCards, expandVariantCards } from "./catalogue-cards.ts";
import type { Product } from "./types.ts";

const product = (slug: string, price: number, family: string | null = "gloves") => ({
  slug, name: slug, variantGroup: family, brand: "Generic", taxClass: "standard",
  packs: [{ id: slug, sku: slug, priceAED: price, tiers: [] }], combinations: [],
} as unknown as Product);

test("same-price sisters share a card; different prices retain their own cards", () => {
  assert.deepEqual(distinctPriceCards([product("small", 10), product("large", 10), product("xl", 12)])
    .map((p) => p.slug), ["small", "xl"]);
  assert.equal(distinctPriceCards([product("a", 10, null), product("b", 10, null)]).length, 2);
});

test("different price combinations under one parent get individual cards", () => {
  const p = product("gloves", 10);
  p.combinations = [
    { values: { Size: "S" }, packs: p.packs, outOfStock: false },
    { values: { Size: "L" }, packs: product("large", 10).packs, outOfStock: false },
    { values: { Size: "XL" }, packs: product("xl", 12).packs, outOfStock: false },
  ];
  const cards = distinctPriceCards(expandVariantCards([p]));
  assert.equal(cards.length, 2);
  assert.equal(cards[1].defaultPackId, "xl");
  assert.equal(cards[1].combinations.length, 3);
});

test("different-price packs get cards even without colour or size options", () => {
  const p = product("bottle", 10, null);
  p.packs.push({ ...p.packs[0], id: "litre", sku: "BOTTLE-1L", priceAED: 25, images: ["/litre.png"] });
  const cards = distinctPriceCards(expandVariantCards([p]));
  assert.equal(cards.length, 2);
  assert.equal(cards[1].sku, "BOTTLE-1L");
  assert.deepEqual(cards[1].images, ["/litre.png"]);
});
