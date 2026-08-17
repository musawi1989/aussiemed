import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SUPPLY_STATES,
  SUPPLY_STATE_META,
  availabilityFor,
  isSupplyState,
  keepsAlternative,
  supplyNotice,
  supplyStateMeta,
} from "./supply-state.ts";

describe("the states", () => {
  it("describes every one of them", () => {
    for (const state of SUPPLY_STATES) {
      const meta = SUPPLY_STATE_META[state];
      assert.ok(meta.label.length > 2, state);
      assert.ok(meta.meaning.length > 10, state);
    }
  });

  it("lets only Available be supplied", () => {
    assert.equal(availabilityFor("Available"), true);
    assert.equal(availabilityFor("OutOfStock"), false);
    assert.equal(availabilityFor("Discontinued"), false);
  });

  it("separates the two reasons rather than lumping them together", () => {
    // Out of stock is a waiting problem; discontinued is a catalogue problem.
    // Treating them the same is how a line stays on the shelf for a year being
    // quietly bought from the backup at a worse price.
    assert.notEqual(
      SUPPLY_STATE_META.OutOfStock.tone,
      SUPPLY_STATE_META.Discontinued.tone
    );
  });

  it("asks for an alternative only when one would help", () => {
    assert.equal(keepsAlternative("Available"), false);
    assert.equal(keepsAlternative("OutOfStock"), true);
    assert.equal(keepsAlternative("Discontinued"), true);
  });

  it("treats an unknown state as available rather than blocking supply", () => {
    // A state this module has not been taught about must not silently stop
    // ordering from a supplier who is perfectly able to send the goods.
    assert.equal(isSupplyState("Exploded"), false);
    assert.equal(availabilityFor("Exploded"), true);
    assert.equal(supplyStateMeta("Exploded").label, "Can supply");
  });
});

describe("what the admin is told", () => {
  it("says nothing when the supplier can supply", () => {
    assert.equal(
      supplyNotice({ state: "Available", supplierName: "Livingstone" }),
      null
    );
  });

  it("names the supplier and the reason", () => {
    assert.equal(
      supplyNotice({ state: "OutOfStock", supplierName: "Livingstone" }),
      "Livingstone is out of stock."
    );
    assert.equal(
      supplyNotice({ state: "Discontinued", supplierName: "Livingstone" }),
      "Livingstone has discontinued this line."
    );
  });

  it("carries the replacement when one was offered", () => {
    assert.equal(
      supplyNotice({
        state: "Discontinued",
        supplierName: "Livingstone",
        alternativeName: "Nitrile Gloves, Large",
      }),
      "Livingstone has discontinued this line, and suggests Nitrile Gloves, Large instead."
    );
  });
});
