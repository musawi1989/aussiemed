import test from "node:test";
import assert from "node:assert/strict";
import { supplierWork } from "./supplier-work-maths.ts";
const base = { qtyOrdered: 10, qtyReceived: 0, qtyConfirmed: null, qtyReviewed: null, docketLines: [] };
test("unreviewed orders accumulate, confirmed shortages remain separate, new demand is actionable", () => {
  assert.equal(supplierWork(base).ready, 10);
  assert.deepEqual(supplierWork({ ...base, qtyConfirmed: 4, qtyReviewed: 10 }), { sent: 0, outstanding: 10, ready: 4, backordered: 6, prepared: 0 });
  assert.equal(supplierWork({ ...base, qtyOrdered: 15, qtyConfirmed: 4, qtyReviewed: 10 }).ready, 9);
});
test("each dispatch removes only its quantities; prepared dockets cannot be sent twice", () => {
  const line = { ...base, qtyConfirmed: 4, qtyReviewed: 10, docketLines: [{ qty: 4, docket: { dispatchedAt: new Date() } }] };
  assert.equal(supplierWork(line).ready, 0);
  assert.equal(supplierWork(line).backordered, 6);
  assert.equal(supplierWork({ ...line, qtyConfirmed: 10 }).ready, 6);
  assert.equal(supplierWork({ ...base, docketLines: [{ qty: 4, docket: { dispatchedAt: null } }] }).prepared, 4);
  assert.equal(supplierWork({ ...base, qtyReceived: 10 }).outstanding, 0);
});
