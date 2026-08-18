import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toSnapshot, toSnapshotList } from "./catalog-snapshot.ts";
import { matchesSearch } from "./query.ts";
import type { Product } from "./types.ts";

const product: Product = {
  id: 1,
  skuId: 11,
  slug: "nitrile-gloves-large",
  sku: "TS-1042",
  name: "Universal Nitrile Examination Gloves Large",
  brand: "Universal Choice",
  description: "A long description that only the product page ever renders. ".repeat(20),
  categoryId: 7,
  categoryPath: [
    { id: 3, name: "Protective Wear PPE", slug: "protective-wear-ppe" },
    { id: 7, name: "Hand Protection", slug: "hand-protection" },
  ],
  priceAED: 24.5,
  unit: "Box",
  packSize: "100 Pieces/Box",
  outOfStock: false,
  images: ["/products/seed/gloves-1.jpg", "/products/seed/gloves-2.jpg"],
  tiers: [{ minQty: 10, priceAED: 22 }],
  taxClass: "standard",
  variantGroup: "nitrile-gloves",
  variantLabel: "Large",
  familyMembers: [
    { slug: "nitrile-gloves-medium", label: "Medium", name: "…", outOfStock: false },
  ],
  packs: [
    {
      id: "base",
      sku: "TS-1042",
      label: "100 Pieces/Box",
      shortLabel: "Box",
      eachesPerPack: 100,
      priceAED: 24.5,
      tiers: [{ minQty: 10, priceAED: 22 }],
      outOfStock: false,
    },
  ],
  defaultPackId: "base",
  variants: [{ name: "Size", selected: "Large", options: [{ value: "Large", available: true }] }],
  attributes: [{ label: "Material", value: "Nitrile" }],
  documents: [{ label: "SDS", href: "/docs/sds.pdf" }],
  badges: ["top-seller"],
  isPlaceholder: true,
  detailKey: null,
  sourceNote: "Seeded from a public catalogue.",
};

describe("toSnapshot", () => {
  it("carries exactly the fields the browser reads, and no others", () => {
    // Named explicitly rather than counted: a new field on Product must not be
    // able to join a payload every visitor downloads without this test failing.
    assert.deepEqual(Object.keys(toSnapshot(product)).sort(), [
      "brand",
      "categoryPath",
      "defaultPackId",
      "id",
      "images",
      "name",
      "outOfStock",
      "packSize",
      "packs",
      "priceAED",
      "skuId",
      "slug",
      "sku",
      "taxClass",
      "unit",
    ].sort());
  });

  it("drops the prose, which is the bulk of it", () => {
    const slim = toSnapshot(product) as Record<string, unknown>;
    for (const field of [
      "description",
      "attributes",
      "documents",
      "variants",
      "familyMembers",
      "badges",
      "tiers",
      "isPlaceholder",
      "sourceNote",
      "categoryId",
    ]) {
      assert.equal(slim[field], undefined, field);
    }
  });

  it("is meaningfully smaller than what it replaces", () => {
    const before = JSON.stringify(product).length;
    const after = JSON.stringify(toSnapshot(product)).length;
    assert.ok(after < before / 2, `${after} vs ${before}`);
  });

  it("keeps one image, not the gallery", () => {
    assert.deepEqual(toSnapshot(product).images, ["/products/seed/gloves-1.jpg"]);
    assert.deepEqual(toSnapshot({ ...product, images: [] }).images, []);
  });

  it("keeps every price break on every pack", () => {
    // A cart line reprices itself as quantity changes. Dropping these would make
    // the cart quietly disagree with the product page.
    assert.deepEqual(toSnapshot(product).packs[0].tiers, product.packs[0].tiers);
  });

  it("leaves the search finding the same things", () => {
    const slim = toSnapshot(product);
    for (const term of ["nitrile", "universal choice", "TS-1042", "100 Pieces", "hand protection"]) {
      assert.equal(matchesSearch(slim, term), matchesSearch(product, term), term);
    }
    assert.equal(matchesSearch(slim, "dental"), false);
  });

  it("maps a list without reordering it", () => {
    const list = toSnapshotList([product, { ...product, id: 2, slug: "second" }]);
    assert.deepEqual(list.map((p) => p.id), [1, 2]);
  });
});
