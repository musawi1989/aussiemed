import { test } from "node:test";
import assert from "node:assert/strict";
import { checkShipment, planLines, isFullyShipped } from "./shipment-maths.ts";
import { checkDocket, statusAfterDocket } from "./docket-maths.ts";

const orderLine = { id: 'a', name: 'Item', skuCode: 'SKU', unitLabel: 'Box', status: 'Packed', qty: 10, shipped: 3, reserved: 4 };
const poLine = { id: 'a', name: 'Item', skuCode: 'SKU', qtyOrdered: 10, qtyConfirmed: 10, docketed: 3 };
test("prepared shipments reserve stock without counting as dispatched", () => {
  assert.equal(planLines([orderLine])[0].outstanding, 3);
  assert.equal(isFullyShipped([{ ...orderLine, reserved: 7 }]), false);
  assert.equal(checkShipment([orderLine], [{ orderItemId: 'a', qty: 4 }]).ok, false);
  assert.equal(checkShipment([orderLine], [{ orderItemId: 'a', qty: 3 }]).ok, true);
});
test("invalid quantities are not silently filtered out of otherwise valid batches", () => {
  for (const qty of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(checkShipment([orderLine], [{ orderItemId: 'a', qty: 1 }, { orderItemId: 'bad', qty }]).ok, false);
    assert.equal(checkDocket([poLine], [{ purchaseOrderLineId: 'a', qty: 1 }, { purchaseOrderLineId: 'bad', qty }]).ok, false);
  }
});
test("correcting the last dispatched docket restores an unshipped status", () => {
  assert.equal(statusAfterDocket('Dispatched', [{ ...poLine, docketed: 0 }]), 'Acknowledged');
  assert.equal(statusAfterDocket('Sent', [{ ...poLine, docketed: 0 }]), 'Sent');
  assert.equal(statusAfterDocket('Received', [{ ...poLine, docketed: 0 }]), 'Received');
});
