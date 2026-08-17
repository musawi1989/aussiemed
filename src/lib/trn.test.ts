import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLACEHOLDER_BUYER_TRN,
  PLACEHOLDER_SELLER_TRN,
  TRN_DIGITS,
  formatTrn,
  invoiceCompliance,
  isPlaceholderTrn,
  isRealTrn,
  normaliseTrn,
} from "./trn.ts";

/** A plausible real one: every Emirates TRN issued to date begins 100. */
const REAL_SELLER = "100123456700003";
const REAL_BUYER = "100987654300003";

describe("reading a TRN as typed", () => {
  it("accepts fifteen plain digits", () => {
    assert.equal(normaliseTrn(REAL_SELLER), REAL_SELLER);
  });

  it("strips the formatting people paste in with it", () => {
    // Off a letterhead, an email, a spreadsheet, or Word with its own spaces.
    for (const typed of [
      "100 123 456 700 003",
      "100-123-456-700-003",
      "TRN 100123456700003",
      "  100123456700003  ",
      "100 123 456 700 003",
    ]) {
      assert.equal(normaliseTrn(typed), REAL_SELLER, typed);
    }
  });

  it("refuses anything that is not fifteen digits", () => {
    // Sixteen is a typo, not a long TRN — accepting it would store a number
    // that no authority will recognise and nothing later would question.
    assert.equal(normaliseTrn("1001234567000031"), null);
    assert.equal(normaliseTrn("10012345670000"), null);
    assert.equal(normaliseTrn(""), null);
    assert.equal(normaliseTrn(null), null);
    assert.equal(normaliseTrn(undefined), null);
    assert.equal(normaliseTrn("not a number at all"), null);
  });

  it("groups for proofreading", () => {
    assert.equal(formatTrn(REAL_SELLER), "100 123 456 700 003");
    assert.equal(formatTrn("bad"), null);
  });
});

describe("telling a placeholder from the real thing", () => {
  it("knows the placeholders it ships with", () => {
    assert.ok(isPlaceholderTrn(PLACEHOLDER_SELLER_TRN));
    assert.ok(isPlaceholderTrn(PLACEHOLDER_BUYER_TRN));
    assert.equal(PLACEHOLDER_SELLER_TRN.length, TRN_DIGITS);
    assert.equal(PLACEHOLDER_BUYER_TRN.length, TRN_DIGITS);
  });

  it("recognises a placeholder invented later, without being told", () => {
    // The test is a prefix, not a list, so nobody has to remember to register
    // a new one here.
    assert.ok(isPlaceholderTrn("999912345678901"));
  });

  it("cannot mistake a real TRN for one", () => {
    // Real Emirates TRNs begin 100, so the two ranges cannot collide.
    assert.ok(!isPlaceholderTrn(REAL_SELLER));
    assert.ok(isRealTrn(REAL_SELLER));
    assert.ok(!isRealTrn(PLACEHOLDER_SELLER_TRN));
  });

  it("does not call a missing TRN real", () => {
    assert.ok(!isRealTrn(null));
    assert.ok(!isRealTrn(""));
    assert.ok(!isPlaceholderTrn(null));
  });

  it("sees through formatting on a placeholder too", () => {
    assert.ok(isPlaceholderTrn("9999 0000 0000 001"));
  });
});

describe("whether a document may call itself a tax invoice", () => {
  it("says yes when the seller is registered and the buyer is not", () => {
    // An unregistered business is entitled to a tax invoice without a TRN of
    // its own. This is the ordinary case, not a fault.
    const result = invoiceCompliance({ sellerTrn: REAL_SELLER, buyerTrn: null });
    assert.equal(result.compliant, true);
    assert.equal(result.usesPlaceholder, false);
    assert.deepEqual(result.reasons, []);
  });

  it("says yes when both are registered", () => {
    const result = invoiceCompliance({
      sellerTrn: REAL_SELLER,
      buyerTrn: REAL_BUYER,
    });
    assert.equal(result.compliant, true);
  });

  it("says no when the seller has no TRN, whatever the buyer has", () => {
    // The bug this module was written for: compliance was decided on the
    // buyer's TRN alone, so putting one on a test customer was enough to head
    // the document "Tax invoice" while AussieMed had none at all.
    const result = invoiceCompliance({ sellerTrn: null, buyerTrn: REAL_BUYER });
    assert.equal(result.compliant, false);
    assert.match(result.reasons[0]!, /AussieMed's own TRN/);
  });

  it("refuses to call a placeholder compliant", () => {
    const result = invoiceCompliance({
      sellerTrn: PLACEHOLDER_SELLER_TRN,
      buyerTrn: PLACEHOLDER_BUYER_TRN,
    });
    assert.equal(result.compliant, false);
    assert.equal(result.usesPlaceholder, true);
    assert.equal(result.reasons.length, 2);
    assert.match(result.reasons[0]!, /placeholder/);
  });

  it("flags a placeholder on either side on its own", () => {
    const sellerOnly = invoiceCompliance({
      sellerTrn: PLACEHOLDER_SELLER_TRN,
      buyerTrn: REAL_BUYER,
    });
    assert.equal(sellerOnly.usesPlaceholder, true);
    assert.equal(sellerOnly.compliant, false);

    const buyerOnly = invoiceCompliance({
      sellerTrn: REAL_SELLER,
      buyerTrn: PLACEHOLDER_BUYER_TRN,
    });
    assert.equal(buyerOnly.usesPlaceholder, true);
    assert.equal(buyerOnly.compliant, false);
    assert.match(buyerOnly.reasons[0]!, /customer's TRN is a placeholder/);
  });

  it("never reports a placeholder when both sides are real", () => {
    // The notice must appear exactly when it is true, or it becomes wallpaper.
    const result = invoiceCompliance({
      sellerTrn: REAL_SELLER,
      buyerTrn: REAL_BUYER,
    });
    assert.equal(result.usesPlaceholder, false);
  });

  it("treats a malformed TRN as absent rather than as valid", () => {
    const result = invoiceCompliance({ sellerTrn: "123", buyerTrn: null });
    assert.equal(result.compliant, false);
  });
});
