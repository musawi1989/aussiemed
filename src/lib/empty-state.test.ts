import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyMessage,
  emptyReason,
  enquiryHref,
  type EmptyReason,
} from "./empty-state.ts";

describe("emptyReason", () => {
  it("treats a browsed category as not stocked yet, not as over-filtering", () => {
    assert.equal(emptyReason({ category: "pet-care" }), "category");
  });

  it("puts the search term ahead of the category the buyer happens to be in", () => {
    // They typed something. That is what they are thinking about, even if a
    // category filter is still set from earlier.
    assert.equal(emptyReason({ category: "dental", q: "scalpel" }), "search");
    assert.equal(emptyReason({ q: "  scalpel  " }), "search");
  });

  it("ignores a blank search term rather than reading it as a search", () => {
    assert.equal(emptyReason({ category: "pet-care", q: "   " }), "category");
    assert.equal(emptyReason({ q: "" }), "catalogue");
  });

  it("calls it over-filtering once a brand or in-stock filter is on", () => {
    // The category may well hold products; this buyer excluded them.
    assert.equal(emptyReason({ category: "dental", brand: "Livingstone" }), "filters");
    assert.equal(emptyReason({ category: "dental", inStock: true }), "filters");
    assert.equal(emptyReason({ brand: "Livingstone" }), "filters");
  });

  it("reports an empty catalogue when nothing was asked for at all", () => {
    assert.equal(emptyReason({}), "catalogue");
    assert.equal(emptyReason({ inStock: false }), "catalogue");
  });
});

describe("enquiryHref", () => {
  it("carries the category through so the enquiry does not arrive blank", () => {
    assert.equal(enquiryHref("Pet Care"), "/bulk-buy?about=Pet%20Care");
  });

  it("encodes a name that would otherwise break the query string", () => {
    assert.equal(
      enquiryHref("Wound Care, First Aid & Safety"),
      "/bulk-buy?about=Wound%20Care%2C%20First%20Aid%20%26%20Safety"
    );
  });

  it("falls back to the plain form with nothing to carry", () => {
    assert.equal(enquiryHref(), "/bulk-buy");
    assert.equal(enquiryHref(""), "/bulk-buy");
  });
});

describe("emptyMessage", () => {
  it("names the category rather than talking about filters", () => {
    const message = emptyMessage("category", { categoryName: "Pet Care" });
    assert.match(message.title, /Pet Care/);
    assert.equal(message.primary?.href, "/bulk-buy?about=Pet%20Care");
    assert.doesNotMatch(message.body, /filter/i);
  });

  it("offers to clear the filters only when there are filters to clear", () => {
    assert.equal(emptyMessage("filters").primary?.href, "/products");
    for (const reason of ["category", "search", "catalogue"] as EmptyReason[]) {
      const message = emptyMessage(reason, { categoryName: "Dental", q: "x" });
      assert.notEqual(message.primary?.label, "Clear all filters");
    }
  });

  it("quotes the term back on a search that found nothing", () => {
    const message = emptyMessage("search", { q: "scalpel" });
    assert.match(message.title, /scalpel/);
    assert.equal(message.primary?.href, "/bulk-buy?about=scalpel");
  });

  it("still reads as a sentence when the category name is missing", () => {
    // Reachable through a slug that resolves to nothing.
    const message = emptyMessage("category", {});
    assert.equal(message.title, "Nothing listed here yet");
    assert.equal(message.primary?.href, "/bulk-buy");
    assert.match(message.body, /^This category/);
  });

  it("always gives the buyer somewhere to go", () => {
    for (const reason of ["search", "category", "filters", "catalogue"] as EmptyReason[]) {
      assert.ok(emptyMessage(reason).primary, reason);
    }
  });
});
