import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkShipment,
  hasShipped,
  isFullyShipped,
  orderStatusAfterShipping,
  planLines,
  statusAfterShipping,
  type OrderLineForShipping,
} from "./shipment-maths.ts";

const line = (
  over: Partial<OrderLineForShipping> = {}
): OrderLineForShipping => ({
  id: "line-1",
  name: "Gauze Swabs Non-Sterile",
  skuCode: "LV-1001",
  unitLabel: "Box of 100",
  qty: 60,
  status: "Pending",
  shipped: 0,
  ...over,
});

describe("what is still owed on a line", () => {
  it("is the order quantity when nothing has gone", () => {
    assert.equal(planLines([line()])[0].outstanding, 60);
  });

  it("falls by what has already been sent", () => {
    assert.equal(planLines([line({ shipped: 40 })])[0].outstanding, 20);
  });

  it("is nothing on a cancelled line, whatever the quantity says", () => {
    // Counting a cancelled line as owed would keep the order looking
    // unfulfilled forever, and somebody would keep making empty packing lists.
    const [result] = planLines([line({ status: "Cancelled" })]);
    assert.equal(result.outstanding, 0);
    assert.ok(result.settled);
  });

  it("never goes negative when more was sent than ordered", () => {
    // Should not happen, but a negative outstanding would read as a credit and
    // quietly corrupt every total built on top of it.
    assert.equal(planLines([line({ shipped: 80 })])[0].outstanding, 0);
  });
});

describe("whether an order is finished", () => {
  it("is finished when every line has gone in full", () => {
    assert.ok(isFullyShipped([line({ shipped: 60 }), line({ id: "b", qty: 5, shipped: 5 })]));
  });

  it("is not finished while one line is part-sent", () => {
    assert.ok(!isFullyShipped([line({ shipped: 60 }), line({ id: "b", qty: 5, shipped: 4 })]));
  });

  it("ignores cancelled lines when deciding", () => {
    // An order whose remainder was cancelled IS finished. Otherwise cancelling
    // the untouched half of an order leaves it open for good.
    assert.ok(
      isFullyShipped([
        line({ shipped: 60 }),
        line({ id: "b", qty: 5, shipped: 0, status: "Cancelled" }),
      ])
    );
  });

  it("tells not-yet-sent apart from part-sent", () => {
    assert.ok(!hasShipped([line(), line({ id: "b" })]));
    assert.ok(hasShipped([line({ shipped: 1 }), line({ id: "b" })]));
  });
});

describe("checking a proposed packing list", () => {
  const lines = [line(), line({ id: "line-2", name: "Transfer Pipette", qty: 15 })];

  it("accepts a despatch of part of a line", () => {
    const result = checkShipment(lines, [{ orderItemId: "line-1", qty: 40 }]);
    assert.ok(result.ok);
    assert.deepEqual(result.lines, [{ orderItemId: "line-1", qty: 40 }]);
  });

  it("drops the lines left blank rather than complaining about them", () => {
    // Forty lines despatching two must not be thirty-eight error messages.
    const result = checkShipment(lines, [
      { orderItemId: "line-1", qty: 40 },
      { orderItemId: "line-2", qty: 0 },
    ]);
    assert.ok(result.ok);
    assert.equal(result.lines.length, 1);
  });

  it("refuses a packing list with nothing on it", () => {
    const result = checkShipment(lines, [{ orderItemId: "line-1", qty: 0 }]);
    assert.ok(!result.ok);
    assert.match(result.error, /Nothing is on this packing list/);
  });

  it("refuses more than is owed, and says how many are", () => {
    // Refuses rather than clamps: silently sending 60 when the packer typed 80
    // produces a document that disagrees with the box.
    const result = checkShipment([line({ shipped: 40 })], [
      { orderItemId: "line-1", qty: 80 },
    ]);
    assert.ok(!result.ok);
    assert.match(result.error, /only 20 of 60/);
  });

  it("says plainly when a line is already complete", () => {
    const result = checkShipment([line({ shipped: 60 })], [
      { orderItemId: "line-1", qty: 1 },
    ]);
    assert.ok(!result.ok);
    assert.match(result.error, /already been sent in full/);
  });

  it("refuses to send a cancelled line", () => {
    const result = checkShipment([line({ status: "Cancelled" })], [
      { orderItemId: "line-1", qty: 1 },
    ]);
    assert.ok(!result.ok);
    assert.match(result.error, /was cancelled/);
  });

  it("refuses a fractional quantity", () => {
    const result = checkShipment(lines, [{ orderItemId: "line-1", qty: 2.5 }]);
    assert.ok(!result.ok);
    assert.match(result.error, /whole number/);
  });

  it("refuses the same line twice on one list", () => {
    const result = checkShipment(lines, [
      { orderItemId: "line-1", qty: 10 },
      { orderItemId: "line-1", qty: 10 },
    ]);
    assert.ok(!result.ok);
    assert.match(result.error, /appears twice/);
  });

  it("refuses a line that is not on the order", () => {
    const result = checkShipment(lines, [{ orderItemId: "ghost", qty: 1 }]);
    assert.ok(!result.ok);
    assert.match(result.error, /not on this order/);
  });
});

describe("what a line's status becomes", () => {
  it("is Shipped once the whole quantity has gone", () => {
    assert.equal(statusAfterShipping(line({ shipped: 20 }), 40), "Shipped");
  });

  it("is NOT Shipped when only part has gone", () => {
    // The case the feature exists for. Calling it Shipped is how the remainder
    // gets forgotten: the order drops off every queue still owing twenty boxes.
    assert.equal(statusAfterShipping(line(), 40), "Packed");
  });

  it("keeps Backordered on a part-shipped back order", () => {
    // Still true, and it is the word the back-order screens filter on.
    assert.equal(
      statusAfterShipping(line({ status: "Backordered" }), 40),
      "Backordered"
    );
  });

  it("clears Backordered once the line goes in full", () => {
    assert.equal(
      statusAfterShipping(line({ status: "Backordered", shipped: 20 }), 40),
      "Shipped"
    );
  });

  it("leaves a cancelled line cancelled", () => {
    assert.equal(statusAfterShipping(line({ status: "Cancelled" }), 5), "Cancelled");
  });
});

describe("what the order's status becomes", () => {
  it("moves to Dispatched only when everything has gone", () => {
    assert.equal(
      orderStatusAfterShipping("Processing", [line({ shipped: 60 })]),
      "Dispatched"
    );
  });

  it("stays put while anything is still owed", () => {
    // Telling a customer their order has been dispatched while half of it is
    // on a shelf is the worst thing this feature could do, and it would do it
    // on every order that ever had a back order.
    assert.equal(
      orderStatusAfterShipping("Processing", [line({ shipped: 40 })]),
      "Processing"
    );
  });

  it("never revives a cancelled order", () => {
    assert.equal(
      orderStatusAfterShipping("Cancelled", [line({ shipped: 60 })]),
      "Cancelled"
    );
  });

  it("never drags a delivered order back to Dispatched", () => {
    // Found by driving a real order through the whole cycle: recording the
    // final despatch against an order already marked Delivered pushed it
    // backwards, because the only test was "is it finished". An order that has
    // arrived has also been dispatched — the later word is the true one.
    assert.equal(
      orderStatusAfterShipping("Delivered", [line({ shipped: 60 })]),
      "Delivered"
    );
  });

  it("leaves an already-dispatched order alone", () => {
    assert.equal(
      orderStatusAfterShipping("Dispatched", [line({ shipped: 60 })]),
      "Dispatched"
    );
  });

  it("advances from Pending and Processing", () => {
    for (const from of ["Pending", "Processing"]) {
      assert.equal(
        orderStatusAfterShipping(from, [line({ shipped: 60 })]),
        "Dispatched",
        from
      );
    }
  });

  it("leaves a status it does not recognise alone rather than guessing", () => {
    assert.equal(
      orderStatusAfterShipping("Awaiting collection", [line({ shipped: 60 })]),
      "Awaiting collection"
    );
  });
});
