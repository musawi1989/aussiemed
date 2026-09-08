import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  discountLabel,
  formatBasisPoints,
  isDiscountSource,
  lineDiscount,
  orderDiscount,
  sourceLabel,
  type DiscountableLine,
} from "./order-discounts.ts";

/** A line at list: 10 × AED 20.00, nothing agreed. */
const atList: DiscountableLine = {
  qty: 10,
  unitPriceFils: 2000,
  lineTotalFils: 20000,
  listUnitPriceFils: 2000,
  discountSource: null,
};

/** The same line with 2.5% off the account. */
const withAccountDiscount: DiscountableLine = {
  qty: 10,
  unitPriceFils: 1950,
  lineTotalFils: 19500,
  listUnitPriceFils: 2000,
  discountSource: "AccountDiscount",
};

/** A SKU negotiated at AED 17.00 against a list of AED 20.00. */
const withAgreedPrice: DiscountableLine = {
  qty: 10,
  unitPriceFils: 1700,
  lineTotalFils: 17000,
  listUnitPriceFils: 2000,
  discountSource: "AgreedPrice",
};

/** Placed before the list price was snapshotted. */
const historical: DiscountableLine = {
  qty: 10,
  unitPriceFils: 1950,
  lineTotalFils: 19500,
  listUnitPriceFils: null,
  discountSource: null,
};

describe("one line's saving", () => {
  it("finds no saving on a line bought at list", () => {
    const d = lineDiscount(atList);
    assert.equal(d.savingFils, 0);
    assert.equal(d.discounted, false);
    assert.equal(d.source, null);
    assert.equal(d.unknown, false);
  });

  it("measures an account discount off the line total, not the unit", () => {
    // The saving a customer cares about is what came off this line, and a
    // per-unit figure on a line of forty is the wrong number by forty times.
    const d = lineDiscount(withAccountDiscount);
    assert.equal(d.savingFils, 500);
    assert.equal(d.listLineTotalFils, 20000);
    assert.equal(d.savingBasisPoints, 250);
    assert.equal(d.discounted, true);
    assert.equal(d.source, "AccountDiscount");
  });

  it("measures an agreed price against list too", () => {
    const d = lineDiscount(withAgreedPrice);
    assert.equal(d.savingFils, 3000);
    assert.equal(d.savingBasisPoints, 1500);
    assert.equal(d.source, "AgreedPrice");
  });

  it("claims nothing when no list price was recorded", () => {
    // The whole reason `unknown` exists. Zero would read as "checked, and you
    // saved nothing", which is a different statement from "not known".
    const d = lineDiscount(historical);
    assert.equal(d.unknown, true);
    assert.equal(d.listUnitPriceFils, null);
    assert.equal(d.listLineTotalFils, null);
    assert.equal(d.savingFils, 0);
    assert.equal(d.discounted, false);
  });

  it("treats a missing field the same as an explicit null", () => {
    const d = lineDiscount({ qty: 1, unitPriceFils: 500, lineTotalFils: 500 });
    assert.equal(d.unknown, true);
  });

  it("never reports a negative saving when an agreement has gone stale", () => {
    // An agreed price beats volume breaks outright, so a rate agreed a year
    // ago can sit above a break added since. That is a real situation and it
    // must not print as "you saved -AED 2.00".
    const d = lineDiscount({
      qty: 10,
      unitPriceFils: 1700,
      lineTotalFils: 17000,
      listUnitPriceFils: 1500,
      discountSource: "AgreedPrice",
    });
    assert.equal(d.savingFils, 0);
    assert.equal(d.discounted, false);
    // Still an agreed price, and the document should still be able to say so.
    assert.equal(d.source, "AgreedPrice");
  });

  it("does not divide by zero on a line given away free", () => {
    const d = lineDiscount({
      qty: 5,
      unitPriceFils: 0,
      lineTotalFils: 0,
      listUnitPriceFils: 0,
      discountSource: "AgreedPrice",
    });
    assert.equal(d.savingBasisPoints, 0);
    assert.ok(Number.isFinite(d.savingBasisPoints));
  });

  it("reads a free agreed price as the real arrangement it is", () => {
    // Zero is a price somebody agreed — a sample line on a tender — not an
    // absent one.
    const d = lineDiscount({
      qty: 2,
      unitPriceFils: 0,
      lineTotalFils: 0,
      listUnitPriceFils: 2000,
      discountSource: "AgreedPrice",
    });
    assert.equal(d.savingFils, 4000);
    assert.equal(d.savingBasisPoints, 10000);
    assert.equal(d.discounted, true);
  });

  it("ignores a discountSource nobody recognises", () => {
    const d = lineDiscount({ ...atList, discountSource: "StaffPerk" });
    assert.equal(d.source, null);
  });
});

describe("the order's saving", () => {
  it("is nothing on an order entirely at list", () => {
    const d = orderDiscount([atList, atList]);
    assert.equal(d.savingFils, 0);
    assert.equal(d.discounted, false);
    assert.deepEqual(d.sources, []);
  });

  it("adds up both kinds of discount on one order", () => {
    const d = orderDiscount([withAccountDiscount, withAgreedPrice]);
    assert.equal(d.savingFils, 3500);
    assert.equal(d.subtotalFils, 36500);
    assert.equal(d.listSubtotalFils, 40000);
    assert.deepEqual(d.sources, ["AccountDiscount", "AgreedPrice"]);
    assert.equal(d.discounted, true);
  });

  it("takes the percentage from the totals rather than averaging the lines", () => {
    /*
     * One tiny line at half price and one large line at list is not "25% off
     * on average". Averaging line percentages ignores that the lines are
     * different sizes, and would put a wildly overstated figure on an invoice.
     */
    const d = orderDiscount([
      { qty: 1, unitPriceFils: 100, lineTotalFils: 100, listUnitPriceFils: 200 },
      { qty: 100, unitPriceFils: 1000, lineTotalFils: 100000, listUnitPriceFils: 1000 },
    ]);
    assert.equal(d.savingFils, 100);
    // 100 off a list of 100,200 — about 0.1%, not 25%.
    assert.equal(d.savingBasisPoints, 10);
  });

  it("counts the lines it could not compare instead of guessing them", () => {
    const d = orderDiscount([withAccountDiscount, historical]);
    assert.equal(d.unknownLines, 1);
    // Only the line we hold a list price for contributes to the saving.
    assert.equal(d.savingFils, 500);
    // ...and the percentage is measured against that line alone, not against
    // a subtotal that includes one we never compared.
    assert.equal(d.savingBasisPoints, 250);
  });

  it("still reports the full subtotal when some lines are unknown", () => {
    // The money owed is the money owed regardless of what we can say about it.
    const d = orderDiscount([withAccountDiscount, historical]);
    assert.equal(d.subtotalFils, 39000);
    assert.equal(d.listSubtotalFils, 39500);
  });

  it("knows nothing about an order placed entirely before the snapshot", () => {
    const d = orderDiscount([historical, historical]);
    assert.equal(d.listSubtotalFils, null);
    assert.equal(d.discounted, false);
    assert.equal(d.unknownLines, 2);
  });

  it("copes with an order of nothing", () => {
    const d = orderDiscount([]);
    assert.equal(d.subtotalFils, 0);
    assert.equal(d.listSubtotalFils, null);
    assert.equal(d.discounted, false);
  });

  it("lists each source once, in the order it appears", () => {
    const d = orderDiscount([withAgreedPrice, withAccountDiscount, withAgreedPrice]);
    assert.deepEqual(d.sources, ["AgreedPrice", "AccountDiscount"]);
  });

  it("splits the saving by where it came from", () => {
    // A summary showing one "Discount" row against an order that got a
    // percentage off everything AND a tendered rate on one SKU answers
    // neither of the questions the buyer is actually asking.
    const d = orderDiscount([withAccountDiscount, withAgreedPrice]);
    assert.equal(d.savingBySource.AccountDiscount, 500);
    assert.equal(d.savingBySource.AgreedPrice, 3000);
    assert.equal(
      d.savingBySource.AccountDiscount + d.savingBySource.AgreedPrice,
      d.savingFils
    );
  });

  it("leaves both at zero on an order with no arrangement at all", () => {
    const d = orderDiscount([atList, atList]);
    assert.equal(d.savingBySource.AccountDiscount, 0);
    assert.equal(d.savingBySource.AgreedPrice, 0);
  });

  it("does not credit a stale agreed price with a saving it did not make", () => {
    // Named on its line, worth nothing in the totals.
    const d = orderDiscount([
      {
        qty: 10,
        unitPriceFils: 1700,
        lineTotalFils: 17000,
        listUnitPriceFils: 1500,
        discountSource: "AgreedPrice",
      },
    ]);
    assert.deepEqual(d.sources, ["AgreedPrice"]);
    assert.equal(d.savingBySource.AgreedPrice, 0);
    assert.equal(d.discounted, false);
  });
});

describe("wording", () => {
  it("writes basis points the way a person would", () => {
    assert.equal(formatBasisPoints(250), "2.5%");
    assert.equal(formatBasisPoints(500), "5%");
    assert.equal(formatBasisPoints(1000), "10%");
    assert.equal(formatBasisPoints(10000), "100%");
    assert.equal(formatBasisPoints(0), "0%");
  });

  it("does not print a precision it is not claiming", () => {
    // "5.00%" reads as measured to two decimals. It is an exact integer.
    assert.ok(!formatBasisPoints(500).includes(".00"));
    assert.equal(formatBasisPoints(1), "0.01%");
    assert.equal(formatBasisPoints(1250), "12.5%");
  });

  it("survives a nonsense value rather than printing NaN%", () => {
    assert.equal(formatBasisPoints(Number.NaN), "0%");
    assert.equal(formatBasisPoints(Number.POSITIVE_INFINITY), "0%");
  });

  it("names an agreed price rather than quoting a percentage off list", () => {
    // A negotiated rate is not "15% off" — it is a number both sides agreed,
    // and describing it as a percentage invites the question "off what?".
    assert.equal(discountLabel(lineDiscount(withAgreedPrice)), "Agreed price");
  });

  it("still names an agreed price that saves nothing today", () => {
    const stale = lineDiscount({
      qty: 1,
      unitPriceFils: 1700,
      lineTotalFils: 1700,
      listUnitPriceFils: 1500,
      discountSource: "AgreedPrice",
    });
    assert.equal(discountLabel(stale), "Agreed price");
  });

  it("quotes the percentage for an account discount", () => {
    assert.equal(discountLabel(lineDiscount(withAccountDiscount)), "2.5% off list");
  });

  it("quotes the rate the account was given, not one divided back out", () => {
    /*
     * THE BUG THIS EXISTS TO CATCH, found by putting a real order through
     * checkout rather than by any test above it.
     *
     * 2.5% of AED 15.90 is 39.75 fils. Money is integers, so it rounds to 40,
     * and 40 divided back by 1590 is 2.5157% — which printed on the checkout
     * summary as "2.52% off list" against an account contracted at 2.5%.
     *
     * Every unit test here passed throughout, because every one of them used
     * a price that divides exactly.
     */
    const line = lineDiscount({
      qty: 1,
      unitPriceFils: 1550,
      lineTotalFils: 1550,
      listUnitPriceFils: 1590,
      discountSource: "AccountDiscount",
    });
    assert.equal(line.savingBasisPoints, 252);
    assert.equal(discountLabel(line, 250), "2.5% off list");
    // Without the account's rate it can only report what it can see.
    assert.equal(discountLabel(line), "2.52% off list");
  });

  it("ignores the account rate on a line bought at an agreed price", () => {
    // The account discount does not stack on an agreed price, so quoting the
    // rate beside one would describe an arrangement that did not apply.
    assert.equal(discountLabel(lineDiscount(withAgreedPrice), 250), "Agreed price");
  });

  it("falls back to the derived rate when the account rate is zero or absent", () => {
    const line = lineDiscount(withAccountDiscount);
    assert.equal(discountLabel(line, 0), "2.5% off list");
    assert.equal(discountLabel(line, undefined), "2.5% off list");
  });

  it("says nothing about a line with nothing to say", () => {
    assert.equal(discountLabel(lineDiscount(atList)), null);
    assert.equal(discountLabel(lineDiscount(historical)), null);
  });

  it("names a summary row with the rate the account was actually given", () => {
    /*
     * NOT a rate derived from the totals. Per-line rounding can turn an agreed
     * 2.5% into "2.49% off" across an order, and a customer holding a contract
     * that says 2.5% would be right to query the invoice.
     */
    assert.equal(sourceLabel("AccountDiscount", 250), "Account discount 2.5%");
    assert.equal(sourceLabel("AgreedPrice", 250), "Agreed prices");
  });

  it("still names the row when the rate is not to hand", () => {
    assert.equal(sourceLabel("AccountDiscount"), "Account discount");
    assert.equal(sourceLabel("AccountDiscount", 0), "Account discount");
  });
});

describe("recognising a source", () => {
  it("accepts the two we store and nothing else", () => {
    assert.ok(isDiscountSource("AgreedPrice"));
    assert.ok(isDiscountSource("AccountDiscount"));
    assert.ok(!isDiscountSource("accountdiscount"));
    assert.ok(!isDiscountSource(null));
    assert.ok(!isDiscountSource(undefined));
    assert.ok(!isDiscountSource(""));
  });
});
