import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_FEE_BASIS_POINTS,
  CARD_FEE_FIXED_FILS,
  DEFAULT_TERMS,
  TERM_DAYS,
  cardFeeDescription,
  cardFeeFils,
  dueWording,
  isPaymentTerms,
  paymentDueOn,
  termDays,
  termsLabel,
  termsName,
  totalWithCardFeeFils,
} from "./payment-options.ts";

describe("payment terms", () => {
  it("finalises an account order in two weeks by default", () => {
    // The client's words, 23 Aug 2026: "put it on account and it should be
    // finalised in 2 weeks".
    assert.equal(DEFAULT_TERMS, "Net14");
    assert.equal(TERM_DAYS.Net14, 14);
  });

  it("keeps the terms an existing account was already promised", () => {
    // Moving a default must not move what somebody was agreed.
    assert.equal(termDays("Net30"), 30);
    assert.equal(termDays("Net60"), 60);
    assert.equal(termDays("Prepaid"), 0);
  });

  it("falls back to the default rather than to zero", () => {
    // Zero would mean "due today", which is a demand nobody agreed to.
    assert.equal(termDays("Net45"), 14);
    assert.equal(termDays(null), 14);
    assert.equal(termDays(undefined), 14);
  });

  it("counts the due date forward from the day it was placed", () => {
    const placed = new Date("2026-08-23T09:00:00.000Z");
    assert.equal(
      paymentDueOn("Net14", placed).toISOString(),
      "2026-09-06T09:00:00.000Z"
    );
    assert.equal(
      paymentDueOn("Net30", placed).toISOString(),
      "2026-09-22T09:00:00.000Z"
    );
  });

  it("crosses a month end without arithmetic of its own", () => {
    // 14 days from 25 December is 8 January, not the 39th of December.
    const placed = new Date("2026-12-25T00:00:00.000Z");
    assert.equal(
      paymentDueOn("Net14", placed).toISOString(),
      "2027-01-08T00:00:00.000Z"
    );
  });

  it("treats prepaid as due on the day, not as no date at all", () => {
    const placed = new Date("2026-08-23T09:00:00.000Z");
    assert.equal(paymentDueOn("Prepaid", placed).getTime(), placed.getTime());
  });

  it("recognises only the terms that exist", () => {
    assert.ok(isPaymentTerms("Net14"));
    assert.ok(!isPaymentTerms("Net45"));
    assert.ok(!isPaymentTerms(""));
    assert.ok(!isPaymentTerms(null));
  });

  it("does not build a sentence out of a prepaid label", () => {
    // "Due 23 August 2026 — payable before dispatch from today" is what
    // concatenation produced, and it is not English. Prepaid gets its own
    // sentence rather than its label dropped into somebody else's.
    const prepaid = dueWording("Prepaid", "23 August 2026");
    assert.equal(prepaid.headline, "Due before dispatch");
    assert.ok(!prepaid.headline.includes("2026"));
    assert.ok(!prepaid.detail.includes("payable before dispatch from"));
  });

  it("names the date for an account on terms", () => {
    const net14 = dueWording("Net14", "6 September 2026");
    assert.equal(net14.headline, "Due 6 September 2026");
    assert.equal(
      net14.detail,
      "We confirm the order and send you the invoice, then dispatch in line with your agreed terms — 14 days (two weeks) from the day the order is placed."
    );
  });

  it("invoices before it dispatches, whatever the terms", () => {
    // The copy used to say we dispatch and then invoice, which is backwards.
    // Both branches of the sentence now put the invoice first.
    for (const terms of ["Prepaid", "Net7", "Net14", "Net30", "Net60"]) {
      const { detail } = dueWording(terms, "6 September 2026");
      assert.match(detail, /send you the invoice/, terms + ": " + detail);
      assert.doesNotMatch(
        detail,
        /dispatch the order and invoice|take payment before anything ships/,
        terms + ": " + detail
      );
    }
  });

  it("says the goods follow the payment when the account is prepaid", () => {
    const { detail } = dueWording("Prepaid", "23 August 2026");
    assert.match(detail, /dispatched once it is settled/);
  });

  it("says the goods follow the arrangement when the account has terms", () => {
    // What the client asked for: a buyer with terms should be told the order
    // ships in accordance with the arrangement they were given, not that it is
    // held until somebody pays.
    for (const terms of ["Net7", "Net14", "Net30", "Net60"]) {
      const { detail } = dueWording(terms, "6 September 2026");
      assert.match(detail, /dispatch in line with your agreed terms/, terms);
      assert.doesNotMatch(detail, /once it is settled/, terms);
    }
  });

  it("names each account's own terms rather than a house default", () => {
    // Two buyers checking out at the same moment must not be shown the same
    // arrangement. This is the whole point of reading it off the account.
    const seen = new Set<string>();
    for (const terms of ["Prepaid", "Net7", "Net14", "Net30", "Net60"]) {
      const { arrangement } = dueWording(terms, "6 September 2026");
      assert.ok(arrangement.length > 0, terms);
      seen.add(arrangement);
    }
    assert.equal(seen.size, 5);

    assert.equal(dueWording("Net30", "x").arrangement, "Net 30 — 30 days");
    assert.equal(
      dueWording("Prepaid", "x").arrangement,
      "Prepaid — payable before dispatch"
    );
  });

  it("falls back to the default arrangement for a term nobody recognises", () => {
    // A blank or stale value on an account must still produce a sentence, and
    // must not silently read as "due today".
    for (const terms of [null, undefined, "", "Net45"]) {
      const { arrangement, detail } = dueWording(terms, "6 September 2026");
      assert.equal(arrangement, "Net 14 — 14 days (two weeks)", String(terms));
      assert.ok(detail.endsWith("."), String(terms));
    }
  });

  it("reads properly for every term, not just the two we looked at", () => {
    for (const terms of ["Prepaid", "Net7", "Net14", "Net30", "Net60"]) {
      const { headline, detail, arrangement } = dueWording(
        terms,
        "6 September 2026"
      );
      assert.ok(headline.startsWith("Due "), terms + ": " + headline);
      assert.ok(detail.endsWith("."), terms + ": " + detail);
      /*
       * A REAL double-space check. This read /s{2}/ — two letter s's, not two
       * spaces — because the backslash was eaten when the test was written, so
       * it had never once looked at spacing and passed regardless. The same
       * escape-eating that took out withoutTopMargin in CountryFields.
       */
      assert.ok(
        !/ {2}/.test(headline + detail + arrangement),
        terms + " has doubled spaces"
      );
      assert.ok(!/ from today./.test(detail) || terms !== "Prepaid");
    }
  });

  it("says two weeks in words as well as days", () => {
    assert.equal(termsLabel("Net14"), "14 days (two weeks)");
    assert.equal(termsLabel("Net30"), "30 days");
    assert.equal(termsLabel("Prepaid"), "Payable before dispatch");
  });

  it("names the arrangement the way a person says it", () => {
    // "Net30" is how it is stored; "Net 30" is how it is spoken.
    assert.equal(termsName("Net30"), "Net 30");
    assert.equal(termsName("Net7"), "Net 7");
    assert.equal(termsName("Prepaid"), "Prepaid");
    assert.equal(termsName("nonsense"), "Net 14");
  });
});

describe("the card fee", () => {
  it("is a percentage plus a fixed amount", () => {
    // AED 100.00 at 2.9% + AED 1.00 = AED 3.90.
    assert.equal(cardFeeFils(10_000), 390);
  });

  it("rounds once, half-up, like every other money rule here", () => {
    // 2.9% of AED 1.15 is 3.335 fils, which must round to 3, not 4.
    assert.equal(cardFeeFils(115), Math.round((115 * 290) / 10_000) + 100);
    assert.equal(cardFeeFils(115), 3 + 100);
  });

  it("charges nothing to process nothing", () => {
    // The fixed component alone on an empty order would be a charge for air.
    assert.equal(cardFeeFils(0), 0);
    assert.equal(cardFeeFils(-500), 0);
    assert.equal(totalWithCardFeeFils(0), 0);
  });

  it("adds the fee to the total rather than absorbing it", () => {
    // The client's instruction: charged to them, not us.
    assert.equal(totalWithCardFeeFils(10_000), 10_390);
    assert.ok(totalWithCardFeeFils(10_000) > 10_000);
  });

  it("returns whole fils, never a fraction of one", () => {
    for (const amount of [1, 7, 99, 333, 12_345, 987_654]) {
      const fee = cardFeeFils(amount);
      assert.equal(fee, Math.trunc(fee), `${amount} produced ${fee}`);
    }
  });

  it("describes itself from the same constants it charges from", () => {
    // So the wording on screen cannot drift from the arithmetic.
    assert.equal(cardFeeDescription(), "2.9% + AED 1.00");
    assert.equal(CARD_FEE_BASIS_POINTS, 290);
    assert.equal(CARD_FEE_FIXED_FILS, 100);
  });
});
