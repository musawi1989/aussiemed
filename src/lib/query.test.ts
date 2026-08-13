import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PAGE_SIZE,
  matchesSearch,
  queryProducts,
  relatedFrom,
  suggestFrom,
} from "./query.ts";
import type { Product } from "./types.ts";

/* ------------------------------------------------------------------ *
 * Fixtures — a miniature catalogue with the same shape as the real one
 * ------------------------------------------------------------------ */

const PPE = { id: 19, name: "Protective Wear PPE", slug: "protective-wear-ppe" };
const HANDS = { id: 81, name: "Hand Protection", slug: "hand-protection" };
const FACE = { id: 79, name: "Face Protection", slug: "face-protection" };
const DENTAL = { id: 25, name: "Dental", slug: "dental" };
const BIBS = { id: 119, name: "Dental Bibs & Chains", slug: "dental-bibs-and-chains" };

const CATEGORIES = [PPE, HANDS, FACE, DENTAL, BIBS];
const resolve = (slug: string) => CATEGORIES.find((c) => c.slug === slug);

let nextId = 1;
function product(overrides: Partial<Product> & { name: string }): Product {
  const id = nextId++;
  return {
    id,
    skuId: id,
    slug: `p-${id}`,
    sku: `SKU-${id}`,
    brand: null,
    description: null,
    categoryId: HANDS.id,
    categoryPath: [PPE, HANDS],
    priceAED: 10,
    unit: "Box",
    packSize: null,
    supplierId: 21,
    outOfStock: false,
    images: [],
    tiers: [],
    taxClass: "standard" as const,
    packs: [{ id: "base", sku: `SKU-${id}`, label: "Each", shortLabel: "Each", eachesPerPack: 1, priceAED: 10, tiers: [], outOfStock: false }],
    defaultPackId: "base",
    variants: [],
    attributes: [],
    documents: [],
    badges: [],
    isPlaceholder: false,
    detailKey: null,
    sourceNote: null,
    ...overrides,
  };
}

const gloveMedium = product({
  name: "Nitrile Examination Gloves Powder Free Medium",
  brand: "Medisafe",
  priceAED: 34.5,
});
const gloveLarge = product({
  name: "Nitrile Examination Gloves Powder Free Large",
  brand: "Medisafe",
  priceAED: 34.5,
});
const mask = product({
  name: "Type IIR Surgical Face Mask Level 2",
  brand: "Medisafe",
  categoryId: FACE.id,
  categoryPath: [PPE, FACE],
  priceAED: 18.75,
});
const respirator = product({
  name: "P2/N95 Respirator Flat Fold",
  brand: "Medisafe",
  categoryId: FACE.id,
  categoryPath: [PPE, FACE],
  priceAED: 62,
  outOfStock: true,
});
const bibs = product({
  name: "Dental Bibs 2-Ply Blue",
  brand: "Dentiva",
  categoryId: BIBS.id,
  categoryPath: [DENTAL, BIBS],
  priceAED: 29,
  isPlaceholder: true,
});

const CATALOGUE = [gloveMedium, gloveLarge, mask, respirator, bibs];

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe("category filtering", () => {
  it("actually filters — the old site sent every category to the full list", () => {
    const result = queryProducts(CATALOGUE, resolve, {
      categorySlug: "hand-protection",
    });
    assert.equal(result.total, 2);
    assert.deepEqual(
      result.items.map((p) => p.name).sort(),
      [gloveLarge.name, gloveMedium.name].sort()
    );
  });

  it("rolls a department up to include everything beneath it", () => {
    const result = queryProducts(CATALOGUE, resolve, {
      categorySlug: "protective-wear-ppe",
    });
    assert.equal(result.total, 4); // 2 gloves + mask + respirator
  });

  it("returns nothing for an unknown category rather than everything", () => {
    // Silently ignoring a bad slug would reproduce the original bug.
    const result = queryProducts(CATALOGUE, resolve, {
      categorySlug: "does-not-exist",
    });
    assert.equal(result.total, 0);
    assert.deepEqual(result.items, []);
  });
});

describe("facet counts", () => {
  it("advertises exactly what clicking the facet delivers", () => {
    // This is the invariant the old platform broke: admin count and
    // storefront count diverged.
    const unfiltered = queryProducts(CATALOGUE, resolve, {});

    for (const category of CATEGORIES) {
      const advertised = unfiltered.facetCounts[category.id] ?? 0;
      const delivered = queryProducts(CATALOGUE, resolve, {
        categorySlug: category.slug,
      }).total;
      assert.equal(
        advertised,
        delivered,
        `${category.name}: facet said ${advertised}, list returned ${delivered}`
      );
    }
  });

  it("stays consistent once another filter is applied", () => {
    const filtered = queryProducts(CATALOGUE, resolve, { inStockOnly: true });

    for (const category of CATEGORIES) {
      const advertised = filtered.facetCounts[category.id] ?? 0;
      const delivered = queryProducts(CATALOGUE, resolve, {
        inStockOnly: true,
        categorySlug: category.slug,
      }).total;
      assert.equal(advertised, delivered, category.name);
    }

    // The out-of-stock respirator must have dropped out of Face Protection.
    assert.equal(filtered.facetCounts[FACE.id], 1);
  });

  it("counts a product once per category in its path, parent included", () => {
    const result = queryProducts([gloveMedium], resolve, {});
    assert.equal(result.facetCounts[PPE.id], 1);
    assert.equal(result.facetCounts[HANDS.id], 1);
  });
});

describe("brand facet", () => {
  it("counts brands over the pre-category set", () => {
    const result = queryProducts(CATALOGUE, resolve, {});
    assert.deepEqual(result.brands, [
      { name: "Dentiva", count: 1 },
      { name: "Medisafe", count: 4 },
    ]);
  });

  it("filters by brand", () => {
    const result = queryProducts(CATALOGUE, resolve, { brand: "Dentiva" });
    assert.equal(result.total, 1);
    assert.equal(result.items[0].name, bibs.name);
  });
});

describe("search", () => {
  it("requires every term to match, not just one", () => {
    assert.ok(matchesSearch(gloveLarge, "nitrile large"));
    assert.ok(!matchesSearch(gloveMedium, "nitrile large"));
  });

  it("is case insensitive and searches SKU, brand and category", () => {
    assert.ok(matchesSearch(gloveMedium, "MEDISAFE"));
    assert.ok(matchesSearch(gloveMedium, gloveMedium.sku.toLowerCase()));
    assert.ok(matchesSearch(gloveMedium, "hand protection"));
  });

  it("narrows the result set", () => {
    const result = queryProducts(CATALOGUE, resolve, { q: "gloves" });
    assert.equal(result.total, 2);
  });

  it("ignores one-character terms in suggestions", () => {
    assert.deepEqual(suggestFrom(CATALOGUE, "n"), []);
    assert.ok(suggestFrom(CATALOGUE, "ni").length > 0);
  });

  it("caps suggestions at the requested limit", () => {
    assert.equal(suggestFrom(CATALOGUE, "e", 2).length, 0); // too short
    assert.ok(suggestFrom(CATALOGUE, "medisafe", 2).length <= 2);
  });
});

describe("stock filter", () => {
  it("removes out-of-stock lines when asked", () => {
    const all = queryProducts(CATALOGUE, resolve, {});
    const inStock = queryProducts(CATALOGUE, resolve, { inStockOnly: true });
    assert.equal(all.total, 5);
    assert.equal(inStock.total, 4);
    assert.ok(!inStock.items.some((p) => p.outOfStock));
  });
});

describe("sorting", () => {
  it("orders by price ascending and descending", () => {
    const asc = queryProducts(CATALOGUE, resolve, { sort: "price-asc" });
    assert.equal(asc.items[0].name, mask.name); // 18.75, cheapest

    const desc = queryProducts(CATALOGUE, resolve, { sort: "price-desc" });
    assert.equal(desc.items[0].name, respirator.name); // 62.00, dearest
  });

  it("puts in-stock and real products first under relevance", () => {
    const result = queryProducts(CATALOGUE, resolve, { sort: "relevance" });
    // The out-of-stock respirator must not lead the list.
    assert.notEqual(result.items[0].name, respirator.name);
    // The placeholder outranks only the out-of-stock line.
    assert.equal(result.items.at(-1)!.name, respirator.name);
    assert.equal(result.items.at(-2)!.name, bibs.name);
  });

  it("is stable — equal prices fall back to name order", () => {
    const a = queryProducts(CATALOGUE, resolve, { sort: "price-asc" });
    const b = queryProducts(CATALOGUE, resolve, { sort: "price-asc" });
    assert.deepEqual(
      a.items.map((p) => p.id),
      b.items.map((p) => p.id)
    );
  });
});

describe("pagination", () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    product({ name: `Item ${String(i).padStart(2, "0")}` })
  );

  it("splits into pages of PAGE_SIZE", () => {
    const page1 = queryProducts(many, resolve, { sort: "name" });
    assert.equal(page1.items.length, PAGE_SIZE);
    assert.equal(page1.pageCount, Math.ceil(30 / PAGE_SIZE));
    assert.equal(page1.total, 30);
  });

  it("does not repeat items across pages", () => {
    const seen = new Set<number>();
    const pageCount = queryProducts(many, resolve, { sort: "name" }).pageCount;
    for (let p = 1; p <= pageCount; p += 1) {
      for (const item of queryProducts(many, resolve, { sort: "name", page: p })
        .items) {
        assert.ok(!seen.has(item.id), `item ${item.id} appeared twice`);
        seen.add(item.id);
      }
    }
    assert.equal(seen.size, 30);
  });

  it("clamps out-of-range page numbers instead of returning nothing", () => {
    assert.equal(queryProducts(many, resolve, { page: 999 }).page, 3);
    assert.equal(queryProducts(many, resolve, { page: 0 }).page, 1);
    assert.equal(queryProducts(many, resolve, { page: -4 }).page, 1);
  });

  it("reports one page for an empty result", () => {
    const empty = queryProducts([], resolve, {});
    assert.equal(empty.pageCount, 1);
    assert.equal(empty.total, 0);
  });
});

describe("related products", () => {
  it("finds siblings and excludes the product itself", () => {
    const related = relatedFrom(CATALOGUE, gloveMedium);
    assert.ok(!related.some((p) => p.id === gloveMedium.id));
    assert.ok(related.some((p) => p.id === gloveLarge.id));
  });

  it("does not reach across departments", () => {
    const related = relatedFrom(CATALOGUE, bibs);
    assert.equal(related.length, 0); // bibs is alone under Dental
  });
});
