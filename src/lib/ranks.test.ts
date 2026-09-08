import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RANKS, successorTo } from "./ranks.ts";

/**
 * Who takes over when the primary goes out of stock.
 *
 * The demotion around this is a server function that needs a database and a
 * signed-in supplier; the rule it acts on is here, and this is where the
 * cases that matter can actually be written down.
 */

const supply = (rank: string | null, canSupply = true) => ({ rank, canSupply });

describe("successorTo", () => {
  it("promotes the backup", () => {
    const backup = supply("Backup");
    assert.equal(successorTo("Primary", [supply("Primary"), backup]), backup);
  });

  it("skips a backup who is also out of stock and takes the third", () => {
    // Promoting a supplier who cannot supply either moves the slot without
    // moving a single order, and costs the demoted one their standing for
    // nothing.
    const third = supply("Third");
    const result = successorTo("Primary", [
      supply("Primary"),
      supply("Backup", false),
      third,
    ]);
    assert.equal(result, third);
  });

  it("returns null when nobody left can supply", () => {
    assert.equal(
      successorTo("Primary", [
        supply("Primary"),
        supply("Backup", false),
        supply("Third", false),
      ]),
      null
    );
  });

  it("returns null when there is no cover but the primary", () => {
    // The 14-pack case: taking the rank away would leave the pack with no
    // cover at all, which is worse than the situation being fixed.
    assert.equal(successorTo("Primary", [supply("Primary")]), null);
  });

  it("ignores offers, which are not cover", () => {
    // A null rank means "I can supply this" and receives no purchase order.
    // Promoting one would appoint a supplier we never chose.
    assert.equal(
      successorTo("Primary", [supply("Primary"), supply(null), supply(null)]),
      null
    );
  });

  it("never promotes somebody above the slot being lost", () => {
    // Only ranks BELOW the one being vacated are candidates. A backup losing
    // its slot must not pull the primary down into it.
    const primary = supply("Primary");
    assert.equal(successorTo("Backup", [primary, supply("Backup")]), null);
  });

  it("takes the third when the backup slot is empty", () => {
    const third = supply("Third");
    assert.equal(successorTo("Primary", [supply("Primary"), third]), third);
  });

  it("has nobody to promote below the last rank", () => {
    const last = RANKS[RANKS.length - 1];
    assert.equal(successorTo(last, [supply(last), supply(null)]), null);
  });

  it("follows RANKS order rather than the order it is handed", () => {
    // The array comes out of a database query with no ordering promise.
    const backup = supply("Backup");
    const third = supply("Third");
    assert.equal(
      successorTo("Primary", [third, supply("Primary"), backup]),
      backup
    );
  });
});
