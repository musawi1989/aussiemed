import test from "node:test";
import assert from "node:assert/strict";
import { allocateConsignment } from "./consignment-allocation.ts";

test("successive consignments do not repeat earlier buyer allocations", () => {
  const buyers = [{ reference: "A", qty: 4 }, { reference: "B", qty: 6 }];
  assert.deepEqual(allocateConsignment(buyers, 0, 3), {
    allocations: [{ reference: "A", qty: 3 }], unallocated: 0,
  });
  assert.deepEqual(allocateConsignment(buyers, 3, 5), {
    allocations: [{ reference: "A", qty: 1 }, { reference: "B", qty: 4 }], unallocated: 0,
  });
  assert.deepEqual(allocateConsignment(buyers, 8, 4), {
    allocations: [{ reference: "B", qty: 2 }], unallocated: 2,
  });
});

test("unallocated stock and empty consignments remain explicit", () => {
  assert.deepEqual(allocateConsignment([], 0, 5), { allocations: [], unallocated: 5 });
  assert.deepEqual(allocateConsignment([{ qty: 10 }], 0, 0), { allocations: [], unallocated: 0 });
});
