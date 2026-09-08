import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { paymentAmount, paymentDay, paymentBalance } from "./payment-ledger-maths.ts";

describe("dated payments", () => {
  it("parses decimal money without silently rounding", () => {
    assert.equal(paymentAmount("12.05"), 1205);
    assert.equal(paymentAmount("0.01"), 1);
    for (const value of ["0", "-1", "Infinity", "1e3", "1.001", "", "1,000"]) assert.equal(paymentAmount(value), null);
  });
  it("validates calendar dates and stores Dubai midnight", () => {
    assert.equal(paymentDay("2026-09-07")?.toISOString(), "2026-09-06T20:00:00.000Z");
    assert.equal(paymentDay("2026-02-29"), null);
    assert.equal(paymentDay("2024-02-29")?.toISOString(), "2024-02-28T20:00:00.000Z");
    assert.equal(paymentDay("bad"), null);
  });
  it("accumulates part payments and refunds", () => {
    assert.deepEqual(paymentBalance(2000, 3000, 10000), { paidFils: 5000, paymentStatus: "PartiallyPaid" });
    assert.deepEqual(paymentBalance(5000, 5000, 10000), { paidFils: 10000, paymentStatus: "Paid" });
    assert.deepEqual(paymentBalance(10000, -2000, 10000), { paidFils: 8000, paymentStatus: "PartiallyPaid" });
    assert.deepEqual(paymentBalance(10000, -10000, 10000), { paidFils: 0, paymentStatus: "Refunded" });
  });
  it("rejects overpayments, over-refunds and non-integer amounts", () => {
    assert.throws(() => paymentBalance(9000, 2000, 10000));
    assert.throws(() => paymentBalance(100, -101, 10000));
    assert.throws(() => paymentBalance(100, 0.1, 10000));
  });
});
