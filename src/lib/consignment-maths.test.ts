import { test } from "node:test";
import assert from "node:assert/strict";
import { includedInPackingList } from "./consignment-maths.ts";

const asOf = new Date("2026-09-07T10:00:00Z");
test("the current prepared box is included in its own packing list", () => {
  assert.equal(includedInPackingList({ sequence: 2, dispatchedAt: null }, 2, asOf), true);
});
test("an earlier prepared box remains to follow", () => {
  assert.equal(includedInPackingList({ sequence: 1, dispatchedAt: null }, 2, asOf), false);
});
test("a later dispatch does not rewrite an earlier packing list", () => {
  assert.equal(includedInPackingList({ sequence: 1, dispatchedAt: new Date("2026-09-07T11:00:00Z") }, 2, asOf), false);
});
test("an already dispatched box counts even when batches leave out of sequence", () => {
  assert.equal(includedInPackingList({ sequence: 3, dispatchedAt: new Date("2026-09-07T09:00:00Z") }, 2, asOf), true);
});
