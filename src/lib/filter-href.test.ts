import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hrefWith } from "./filter-href.ts";

describe("hrefWith", () => {
  it("keeps what was already chosen while changing one thing", () => {
    assert.equal(
      hrefWith({ category: "dental", inStock: "1" }, { brand: "Livingstone" }),
      "/products?category=dental&inStock=1&brand=Livingstone"
    );
  });

  it("drops a filter set to undefined or to nothing", () => {
    assert.equal(hrefWith({ category: "dental" }, { category: undefined }), "/products");
    assert.equal(hrefWith({ category: "dental" }, { category: "" }), "/products");
  });

  it("returns the bare path when nothing is filtered", () => {
    assert.equal(hrefWith({}, {}), "/products");
  });

  it("forgets how far the buyer had scrolled", () => {
    // Otherwise changing a filter shows 96 products of something else.
    assert.equal(
      hrefWith({ category: "dental", show: "96" }, { category: "endodontics" }),
      "/products?category=endodontics"
    );
  });

  it("escapes what a category or brand name may contain", () => {
    assert.equal(
      hrefWith({}, { brand: "Livingstone Xtreme & Co" }),
      "/products?brand=Livingstone+Xtreme+%26+Co"
    );
  });

  it("clears several filters at once", () => {
    assert.equal(
      hrefWith(
        { category: "dental", brand: "X", minPrice: "10", breaks: "1" },
        { brand: undefined, minPrice: undefined, breaks: undefined }
      ),
      "/products?category=dental"
    );
  });
});
