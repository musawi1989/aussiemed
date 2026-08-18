import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SAMPLES_PER_CATEGORY,
  isSampleSkuCode,
  isSampleSlug,
  samplePack,
  samplePriceFils,
  sampleName,
  sampleOutOfStock,
  sampleSkuCode,
  sampleSlug,
  samplesNeeded,
} from "./sample-products.ts";

describe("identifying a sample", () => {
  it("recognises what it generates", () => {
    assert.ok(isSampleSlug(sampleSlug("endodontics", 3)));
    assert.ok(isSampleSkuCode(sampleSkuCode("endodontics", 3)));
  });

  it("does not claim a real product", () => {
    // The seeded catalogue and anything the client uploads must be untouched by
    // the retirement exemption and by --remove.
    for (const slug of [
      "universal-nitrile-examination-gloves-large",
      "sterile-gauze-swab",
      "",
    ]) {
      assert.equal(isSampleSlug(slug), false, slug);
    }
    for (const code of ["TS-1042", "LIV-3391", "SAMPLER-1", ""]) {
      assert.equal(isSampleSkuCode(code), false, code);
    }
  });

  it("survives a missing value rather than throwing", () => {
    assert.equal(isSampleSlug(null), false);
    assert.equal(isSampleSkuCode(undefined), false);
  });

  it("keeps one sample per category and number", () => {
    const slugs = new Set<string>();
    for (const category of ["endodontics", "pet-toys", "glassware"]) {
      for (let n = 1; n <= SAMPLES_PER_CATEGORY; n += 1) slugs.add(sampleSlug(category, n));
    }
    assert.equal(slugs.size, 15);
  });
});

describe("what a sample says it is", () => {
  it("names itself a sample, so nobody has to check the register", () => {
    assert.equal(sampleName("Endodontics", 3), "Endodontics sample product 3");
  });
});

describe("samplePriceFils", () => {
  it("is stable, so a re-seed does not reprice the catalogue", () => {
    assert.equal(samplePriceFils("endodontics", 1), samplePriceFils("endodontics", 1));
    assert.notEqual(samplePriceFils("endodontics", 1), samplePriceFils("endodontics", 2));
  });

  it("stays a whole number of fils, on a clean half-dirham", () => {
    for (const category of ["endodontics", "pet-toys", "glassware", "waxes"]) {
      for (let n = 1; n <= SAMPLES_PER_CATEGORY; n += 1) {
        const fils = samplePriceFils(category, n);
        assert.ok(Number.isInteger(fils), `${category} ${n} = ${fils}`);
        assert.equal(fils % 50, 0);
        assert.ok(fils >= 500 && fils <= 24_950, `${category} ${n} = ${fils}`);
      }
    }
  });
});

describe("samplePack", () => {
  it("gives two shapes, and never a pack of zero", () => {
    for (let n = 1; n <= SAMPLES_PER_CATEGORY; n += 1) {
      const pack = samplePack(n);
      assert.ok(pack.eachesPerPack >= 1);
      assert.ok(pack.unitLabel.length > 0);
    }
    assert.equal(samplePack(1).eachesPerPack, 1);
    assert.equal(samplePack(2).eachesPerPack, 10);
  });
});

describe("sampleOutOfStock", () => {
  it("leaves exactly one of five out of stock", () => {
    const out = [1, 2, 3, 4, 5].filter(sampleOutOfStock);
    assert.deepEqual(out, [5]);
  });
});

describe("samplesNeeded", () => {
  it("tops a category up to five and no further", () => {
    assert.equal(samplesNeeded(0), 5);
    assert.equal(samplesNeeded(2), 3);
    assert.equal(samplesNeeded(5), 0);
  });

  it("never asks for a negative when a category is already fuller than five", () => {
    // Wound Care holds 34. Asking for -29 would be read as "remove real stock".
    assert.equal(samplesNeeded(34), 0);
  });
});
