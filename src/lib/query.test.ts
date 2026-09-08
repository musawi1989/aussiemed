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
    outOfStock: false,
    images: [],
    tiers: [],
    taxClass: "standard" as const,
    packs: [{ id: "base", sku: `SKU-${id}`, label: "Each", shortLabel: "Each", eachesPerPack: 1, priceAED: 10, tiers: [], outOfStock: false }],
    defaultPackId: "base",
    variants: [],
    combinations: [],
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

  it("puts real products ahead of placeholders under relevance", () => {
    const result = queryProducts(CATALOGUE, resolve, { sort: "relevance" });
    const names = result.items.map((p) => p.name);

    assert.equal(names.at(-1), bibs.name);
    // Everything else falls back to name order, so the list is stable.
    const real = names.slice(0, -1);
    assert.deepEqual(real, [...real].sort((a, b) => a.localeCompare(b)));
  });

  /**
   * Stock must not be inferable from position.
   *
   * Relevance used to sort in-stock first, which published exactly what the
   * storefront now hides: whatever sat at the bottom of every list was out of
   * stock, and two page loads a week apart would say which lines had run out.
   */
  it("does not move a product because it is out of stock", () => {
    const asIs = queryProducts(CATALOGUE, resolve, { sort: "relevance" });
    const allInStock = queryProducts(
      CATALOGUE.map((p) => ({ ...p, outOfStock: false })),
      resolve,
      { sort: "relevance" }
    );

    assert.deepEqual(
      asIs.items.map((p) => p.name),
      allInStock.items.map((p) => p.name)
    );
    assert.notEqual(asIs.items.at(-1)!.name, respirator.name);
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

describe("the window", () => {
  const many = Array.from({ length: 60 }, (_, i) =>
    product({ name: `Item ${String(i).padStart(2, "0")}` })
  );

  it("returns the first PAGE_SIZE by default", () => {
    const first = queryProducts(many, resolve, { sort: "name" });
    assert.equal(first.items.length, PAGE_SIZE);
    assert.equal(first.total, 60);
  });

  it("grows from the top, so nothing already seen disappears", () => {
    // The storefront asks for "the first 48", never "the second 24". Getting a
    // window instead would make the products being compared vanish the moment
    // more were asked for.
    const first = queryProducts(many, resolve, { sort: "name" });
    const more = queryProducts(many, resolve, {
      sort: "name",
      limit: PAGE_SIZE * 2,
    });
    assert.equal(more.items.length, PAGE_SIZE * 2);
    assert.deepEqual(
      more.items.slice(0, PAGE_SIZE).map((p) => p.id),
      first.items.map((p) => p.id)
    );
  });

  it("still windows for the paginated API", () => {
    const second = queryProducts(many, resolve, {
      sort: "name",
      offset: PAGE_SIZE,
      limit: PAGE_SIZE,
    });
    const first = queryProducts(many, resolve, { sort: "name" });
    assert.equal(second.items.length, PAGE_SIZE);
    const overlap = second.items.filter((s) =>
      first.items.some((f) => f.id === s.id)
    );
    assert.equal(overlap.length, 0);
  });

  it("stops at the end rather than padding", () => {
    const all = queryProducts(many, resolve, { sort: "name", limit: 999 });
    assert.equal(all.items.length, 60);
    const past = queryProducts(many, resolve, { offset: 100, limit: 24 });
    assert.equal(past.items.length, 0);
    // The total still reports what matched, so the caller can say so.
    assert.equal(past.total, 60);
  });

  it("survives a hand-edited query string", () => {
    // These come straight off the URL, so all of them are reachable.
    assert.equal(queryProducts(many, resolve, { offset: -5 }).items.length, PAGE_SIZE);
    assert.equal(queryProducts(many, resolve, { limit: 0 }).items.length, 1);
    assert.equal(queryProducts(many, resolve, { limit: -3 }).items.length, 1);
    assert.ok(queryProducts(many, resolve, { limit: 1e9 }).items.length <= 500);
  });

  it("reports nothing for an empty catalogue", () => {
    const empty = queryProducts([], resolve, {});
    assert.equal(empty.items.length, 0);
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

describe("price window", () => {
  const priced = (name: string, priceAED: number) =>
    product({
      name,
      priceAED,
      packs: [
        {
          id: "base",
          sku: name,
          label: "Each",
          shortLabel: "Each",
          eachesPerPack: 1,
          priceAED,
          tiers: [],
          outOfStock: false,
        },
      ],
    });

  const cheap = priced("Cheap swab", 5);
  const mid = priced("Mid glove", 50);
  const dear = priced("Dear scanner", 500);
  const shelf = [cheap, mid, dear];

  const names = (query: Parameters<typeof queryProducts>[2]) =>
    queryProducts(shelf, resolve, query).items.map((p) => p.name);

  it("takes a floor, a ceiling, or both", () => {
    assert.deepEqual(names({ minPriceAED: 10 }), ["Dear scanner", "Mid glove"]);
    assert.deepEqual(names({ maxPriceAED: 100 }), ["Cheap swab", "Mid glove"]);
    assert.deepEqual(names({ minPriceAED: 10, maxPriceAED: 100 }), ["Mid glove"]);
  });

  it("includes both ends, because a buyer typing 50 means 50", () => {
    assert.deepEqual(names({ minPriceAED: 50, maxPriceAED: 50 }), ["Mid glove"]);
  });

  it("reads a window given backwards the way it was meant", () => {
    // Typing 100 into "from" and 10 into "to" is a slip, not a request for
    // nothing — and an empty page teaches people the filter is broken.
    assert.deepEqual(names({ minPriceAED: 100, maxPriceAED: 10 }), ["Mid glove"]);
  });

  it("leaves the list alone when neither end is given", () => {
    assert.equal(names({}).length, 3);
  });
});

describe("volume price breaks", () => {
  const withTiers = (name: string, tiers: { minQty: number; priceAED: number }[], onPack = tiers) =>
    product({
      name,
      tiers,
      packs: [
        {
          id: "base",
          sku: name,
          label: "Each",
          shortLabel: "Each",
          eachesPerPack: 1,
          priceAED: 10,
          tiers: onPack,
          outOfStock: false,
        },
      ],
    });

  const flat = withTiers("Flat priced", []);
  const broken = withTiers("Cheaper by ten", [{ minQty: 10, priceAED: 9 }]);
  const cartonOnly = withTiers("Cheaper by the carton", [], [{ minQty: 4, priceAED: 8 }]);

  it("keeps only what actually gets cheaper in quantity", () => {
    const names = queryProducts([flat, broken, cartonOnly], resolve, {
      withBreaksOnly: true,
    }).items.map((p) => p.name);
    assert.deepEqual(names.sort(), ["Cheaper by ten", "Cheaper by the carton"]);
  });

  it("counts a break on any pack, not only on the product", () => {
    // The carton is where the discount usually lives.
    assert.equal(
      queryProducts([cartonOnly], resolve, { withBreaksOnly: true }).items.length,
      1
    );
  });

  it("does nothing unless asked", () => {
    assert.equal(queryProducts([flat, broken], resolve, {}).items.length, 2);
  });
});
