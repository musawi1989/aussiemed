import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coverageOf,
  mostProfitable,
  mostPurchased,
  ownBrandCandidates,
  performanceByProduct,
  spendByCategory,
  type SoldLine,
} from "./own-brand.ts";

const line = (over: Partial<SoldLine> & { productSlug: string }): SoldLine => ({
  productName: over.productSlug,
  brand: null,
  category: "Protective Wear PPE",
  qty: 1,
  revenueFils: 10_000,
  costFils: 6_000,
  orderReference: "AM-2026-000001",
  organisationId: "org-1",
  supplierCount: 1,
  ...over,
});

describe("performanceByProduct", () => {
  it("adds up units, revenue, orders and accounts", () => {
    const [row] = performanceByProduct([
      line({ productSlug: "gloves", qty: 10, revenueFils: 100_000, costFils: 60_000 }),
      line({
        productSlug: "gloves",
        qty: 5,
        revenueFils: 50_000,
        costFils: 30_000,
        orderReference: "AM-2026-000002",
        organisationId: "org-2",
      }),
    ]);

    assert.equal(row.units, 15);
    assert.equal(row.revenueFils, 150_000);
    assert.equal(row.orders, 2);
    assert.equal(row.customers, 2);
    assert.equal(row.profitFils, 60_000);
    assert.equal(row.marginPercent, 40);
  });

  it("counts one account buying twice as one account", () => {
    const [row] = performanceByProduct([
      line({ productSlug: "gauze" }),
      line({ productSlug: "gauze", orderReference: "AM-2026-000009" }),
    ]);
    assert.equal(row.orders, 2);
    assert.equal(row.customers, 1);
  });

  it("keeps an uncosted line out of the profit but not out of the volume", () => {
    // Folding it in at zero cost is the 100% margin defect BE-45 fixed.
    const [row] = performanceByProduct([
      line({ productSlug: "swabs", qty: 4, revenueFils: 40_000, costFils: 25_000 }),
      line({ productSlug: "swabs", qty: 6, revenueFils: 60_000, costFils: null }),
    ]);

    assert.equal(row.units, 10);
    assert.equal(row.revenueFils, 100_000);
    assert.equal(row.uncostedUnits, 6);
    assert.equal(row.costedRevenueFils, 40_000);
    assert.equal(row.profitFils, 15_000);
    // The margin describes the costed part, not the whole line.
    assert.equal(row.marginPercent, 37.5);
  });

  it("reports no profit at all when nothing has been costed", () => {
    const [row] = performanceByProduct([line({ productSlug: "mask", costFils: null })]);
    assert.equal(row.profitFils, null);
    assert.equal(row.marginPercent, null);
  });
});

describe("mostProfitable", () => {
  it("ranks by money earned, not by percentage", () => {
    // 60% of one box is worth less than 12% of four hundred, and ranking by
    // margin is how a catalogue gets optimised for what nobody buys.
    const perf = performanceByProduct([
      line({ productSlug: "boutique", qty: 1, revenueFils: 10_000, costFils: 4_000 }),
      line({ productSlug: "workhorse", qty: 400, revenueFils: 400_000, costFils: 352_000 }),
    ]);
    assert.deepEqual(mostProfitable(perf).map((r) => r.slug), ["workhorse", "boutique"]);
  });

  it("leaves out what cannot be costed rather than ranking it as earning nothing", () => {
    const perf = performanceByProduct([
      line({ productSlug: "known" }),
      line({ productSlug: "unknown", costFils: null }),
    ]);
    assert.deepEqual(mostProfitable(perf).map((r) => r.slug), ["known"]);
  });
});

describe("mostPurchased", () => {
  it("ranks by units", () => {
    const perf = performanceByProduct([
      line({ productSlug: "few", qty: 2 }),
      line({ productSlug: "many", qty: 200 }),
    ]);
    assert.deepEqual(mostPurchased(perf).map((r) => r.slug), ["many", "few"]);
  });

  it("includes what has no cost, because volume is knowable without one", () => {
    const perf = performanceByProduct([
      line({ productSlug: "uncosted", qty: 90, costFils: null }),
      line({ productSlug: "costed", qty: 10 }),
    ]);
    assert.equal(mostPurchased(perf)[0].slug, "uncosted");
  });
});

describe("ownBrandCandidates", () => {
  const bulk = (slug: string, qty: number, revenue: number, cost: number, accounts: number) =>
    Array.from({ length: accounts }, (_, i) =>
      line({
        productSlug: slug,
        qty: Math.round(qty / accounts),
        revenueFils: Math.round(revenue / accounts),
        costFils: Math.round(cost / accounts),
        organisationId: `org-${i}`,
        orderReference: `AM-2026-00000${i}`,
      })
    );

  it("prefers the thin-margin workhorse over the fat-margin rarity", () => {
    // The whole point: a brand taking our margin on a line everybody buys is
    // the line worth owning. Ranking by profit would point at what already works.
    const perf = performanceByProduct([
      ...bulk("gloves", 1000, 1_000_000, 900_000, 5),
      ...bulk("scanner", 2, 200_000, 60_000, 1),
    ]);
    const [top] = ownBrandCandidates(perf);
    assert.equal(top.slug, "gloves");
  });

  it("says why, in words a person can argue with", () => {
    const perf = performanceByProduct([
      ...bulk("gloves", 1000, 1_000_000, 900_000, 5).map((l) => ({
        ...l,
        brand: "Medisafe",
        supplierCount: 3,
      })),
    ]);
    const [top] = ownBrandCandidates(perf);
    assert.ok(top.reasons.some((r) => /units sold/.test(r)));
    assert.ok(top.reasons.some((r) => /accounts/.test(r)));
    assert.ok(top.reasons.some((r) => /margin today/.test(r)));
    assert.ok(top.reasons.some((r) => /suppliers already make it/.test(r)));
    assert.ok(top.reasons.some((r) => /currently Medisafe/.test(r)));
  });

  it("will not judge a line it cannot cost", () => {
    // Three of the four parts are uncomputable, and a print run is real money.
    const perf = performanceByProduct([line({ productSlug: "mystery", qty: 5000, costFils: null })]);
    assert.deepEqual(ownBrandCandidates(perf), []);
  });

  it("flags a loss-making line as a price to fix, not only a brand to own", () => {
    // It does score well, and should — we are stocking somebody else's brand
    // at a loss. But it is a pricing problem first, and a print run is a slow
    // way to fix something a price list fixes this afternoon.
    const perf = performanceByProduct([...bulk("atloss", 100, 100_000, 150_000, 2)]);
    const [row] = ownBrandCandidates(perf);
    assert.ok(row.reasons.some((r) => /price it first/.test(r)), row.reasons.join(" | "));
  });

  it("does not let a loss run away with the score", () => {
    // Clamped: a line at -50% is not five times the opportunity of one at 8%.
    const heavy = performanceByProduct([...bulk("deep", 100, 100_000, 500_000, 2)]);
    const thin = performanceByProduct([...bulk("thin", 100, 100_000, 92_000, 2)]);
    const gap = (ownBrandCandidates(heavy)[0].score ?? 0) - (ownBrandCandidates(thin)[0].score ?? 0);
    assert.ok(gap <= 3, `scores differed by ${gap}`);
  });

  it("scores nothing when there is nothing to score", () => {
    assert.deepEqual(ownBrandCandidates([]), []);
  });
});

describe("spendByCategory", () => {
  it("totals a shelf, since an own brand launches as a range", () => {
    const perf = performanceByProduct([
      line({ productSlug: "a", category: "Gloves", qty: 10, revenueFils: 100_000, costFils: 60_000 }),
      line({ productSlug: "b", category: "Gloves", qty: 5, revenueFils: 50_000, costFils: 30_000 }),
      line({ productSlug: "c", category: "Dental", qty: 1, revenueFils: 10_000, costFils: 5_000 }),
    ]);
    const [top] = spendByCategory(perf);
    assert.equal(top.category, "Gloves");
    assert.equal(top.products, 2);
    assert.equal(top.units, 15);
    assert.equal(top.profitFils, 60_000);
  });

  it("files a product with no category rather than dropping it", () => {
    const perf = performanceByProduct([line({ productSlug: "orphan", category: null })]);
    assert.equal(spendByCategory(perf)[0].category, "Uncategorised");
  });
});

describe("coverageOf", () => {
  it("says how much of its own basis is missing", () => {
    const perf = performanceByProduct([
      line({ productSlug: "a", qty: 10 }),
      line({ productSlug: "b", qty: 5, costFils: null }),
    ]);
    const coverage = coverageOf(perf, 2);
    assert.equal(coverage.productsSold, 2);
    assert.equal(coverage.productsCosted, 1);
    assert.equal(coverage.unitsSold, 15);
    assert.equal(coverage.uncostedUnits, 5);
    assert.equal(coverage.enoughToRank, false);
  });

  it("will not call four orders enough to rank anything", () => {
    assert.equal(coverageOf([], 4).enoughToRank, false);
    assert.equal(coverageOf([], 5).enoughToRank, true);
  });
});
