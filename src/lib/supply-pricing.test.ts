import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_PRICE_REQUEST, priceIntent } from "./supply-terms.ts";

/**
 * A supplier may ask to be paid differently. They may not decide it.
 *
 * The one property that matters more than any other here is the last test:
 * nothing this function returns may write costFils. Everything that spends
 * money reads that column, and the whole design rests on it staying at the
 * agreed figure while a request is outstanding.
 */

const NOW = new Date("2026-08-27T10:00:00.000Z");
const intent = (
  agreed: number | null,
  asked: number | null,
  requested: number | null,
  reason: string | null = null
) => priceIntent(agreed, asked, requested, reason, "Sam at Livingstone", NOW);

describe("a supplier submitting a cost", () => {
  it("raises a request instead of changing what we pay", () => {
    const { data, auditAs } = intent(1444, null, 1600);

    assert.equal(auditAs, "supply.price.request");
    assert.equal(data.proposedCostFils, 1600);
    assert.equal(data.proposedByName, "Sam at Livingstone");
    assert.deepEqual(data.proposedAt, NOW);
  });

  it("keeps the reason they gave", () => {
    const { data } = intent(1444, null, 1600, "Manufacturer increase");
    assert.equal(data.proposedReason, "Manufacturer increase");
  });

  it("does nothing when the price is unchanged", () => {
    const { data, auditAs } = intent(1444, null, 1444);

    assert.deepEqual(data, {});
    assert.equal(auditAs, "supply.update");
  });

  it("does not re-raise a request they have already made", () => {
    const { data, auditAs } = intent(1444, 1600, 1600);

    assert.equal(data.proposedCostFils, undefined);
    assert.equal(auditAs, "supply.update");
  });

  it("still records a reason typed on a second attempt", () => {
    const { data } = intent(1444, 1600, 1600, "Freight has gone up");
    assert.equal(data.proposedReason, "Freight has gone up");
  });

  it("withdraws an outstanding request when they go back to the agreed price", () => {
    const { data, auditAs } = intent(1444, 1600, 1444);

    assert.equal(auditAs, "supply.price.withdraw");
    assert.deepEqual(data, { ...NO_PRICE_REQUEST });
  });

  it("replaces an outstanding request rather than queueing behind it", () => {
    const { data, auditAs } = intent(1444, 1600, 1550);

    assert.equal(auditAs, "supply.price.request");
    assert.equal(data.proposedCostFils, 1550);
  });

  it("treats a first price on a line with no cost as a request too", () => {
    const { data, auditAs } = intent(null, null, 900);

    assert.equal(auditAs, "supply.price.request");
    assert.equal(data.proposedCostFils, 900);
  });

  it("handles a line with no cost being left alone", () => {
    const { data } = intent(null, null, null);
    assert.deepEqual(data, {});
  });

  it("NEVER writes costFils, whatever it is given", () => {
    const cases: [number | null, number | null, number | null][] = [
      [1444, null, 1600],
      [1444, 1600, 1444],
      [1444, 1600, 1550],
      [null, null, 900],
      [1444, null, 1444],
      [null, 1200, null],
    ];

    for (const [agreed, asked, requested] of cases) {
      const { data } = intent(agreed, asked, requested);
      assert.equal(
        "costFils" in data,
        false,
        `costFils was written for ${JSON.stringify([agreed, asked, requested])}`
      );
    }
  });
});
