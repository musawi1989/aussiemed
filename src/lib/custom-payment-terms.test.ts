import test from "node:test";
import assert from "node:assert/strict";
import { customTerms, encodeCustomTerms, isPaymentTerms, paymentDueOn, termsName, termDays } from "./payment-options.ts";
test("custom terms retain wording and calculate the explicit due date", () => {
  const terms = encodeCustomTerms(45, "45 days from invoice");
  assert.equal(isPaymentTerms(terms), true);
  assert.equal(termsName(terms), "45 days from invoice");
  assert.equal(termDays(terms), 45);
  assert.equal(paymentDueOn(terms, new Date("2026-01-01T00:00:00Z")).toISOString(), "2026-02-15T00:00:00.000Z");
  assert.equal(termDays("Net30"), 30);
});
test("custom terms reject malformed, blank and unsafe values", () => {
  for (const value of ["toString", "constructor", "Custom:null", "Custom:broken", encodeCustomTerms(-1, "Negative"), encodeCustomTerms(1.5, "Fraction"), encodeCustomTerms(366, "Too long"), encodeCustomTerms(5, "")]) {
    assert.equal(isPaymentTerms(value), false);
    assert.equal(customTerms(value), null);
  }
});
