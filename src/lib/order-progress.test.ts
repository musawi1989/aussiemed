import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isOpenOrder,
  orderProgress,
  splitDeliveryNote,
} from "./order-progress.ts";
import { ORDER_STATUSES } from "./order-views.ts";

const stateOf = (status: string, key: string) =>
  orderProgress(status).steps.find((s) => s.key === key)?.state;

describe("orderProgress", () => {
  it("puts a new order at the first stage, not at none", () => {
    const p = orderProgress("Pending");
    assert.equal(stateOf("Pending", "Pending"), "current");
    assert.equal(stateOf("Pending", "Processing"), "todo");
    assert.equal(p.closed, false);
    assert.equal(p.cancelled, false);
  });

  it("marks everything before the current stage as done", () => {
    assert.equal(stateOf("Dispatched", "Pending"), "done");
    assert.equal(stateOf("Dispatched", "Processing"), "done");
    assert.equal(stateOf("Dispatched", "Dispatched"), "current");
    assert.equal(stateOf("Dispatched", "Delivered"), "todo");
  });

  it("closes a delivered order with its last stage current", () => {
    const p = orderProgress("Delivered");
    assert.equal(p.closed, true);
    assert.equal(p.cancelled, false);
    assert.equal(stateOf("Delivered", "Delivered"), "current");
    assert.ok(p.steps.filter((s) => s.state === "done").length === 3);
  });

  it("takes a cancelled order off the track entirely", () => {
    const p = orderProgress("Cancelled");
    assert.equal(p.cancelled, true);
    assert.equal(p.closed, true);
    // Not "done" — nothing on the track happened.
    assert.ok(p.steps.every((s) => s.state === "todo"));
    assert.match(p.detail, /nothing will be delivered/i);
  });

  it("never shows the operator's word to the customer", () => {
    // "Pending" reads as "we might not do this". It is the warehouse's word.
    for (const status of ORDER_STATUSES) {
      const p = orderProgress(status);
      assert.ok(!p.headline.includes("Pending"), status);
      assert.ok(!p.headline.includes("Processing"), status);
      for (const step of p.steps) {
        assert.ok(!/^Pending$/.test(step.label));
        assert.ok(!/^Processing$/.test(step.label));
      }
    }
  });

  it("gives every stage a sentence saying what happens next", () => {
    for (const status of ORDER_STATUSES) {
      assert.ok(orderProgress(status).detail.length > 20, status);
    }
  });

  it("falls back to the first stage rather than a blank track", () => {
    // A status added to the database that this module has not been taught.
    const p = orderProgress("AwaitingCustoms");
    assert.equal(p.steps.length, 4);
    assert.equal(p.steps[0].state, "current");
    assert.equal(p.cancelled, false);
    assert.equal(p.closed, false);
  });

  it("always returns the full track so the shape cannot collapse", () => {
    for (const status of [...ORDER_STATUSES, "nonsense"]) {
      assert.equal(orderProgress(status).steps.length, 4);
    }
  });
});

describe("isOpenOrder", () => {
  it("counts anything not finished as still going", () => {
    assert.equal(isOpenOrder("Pending"), true);
    assert.equal(isOpenOrder("Processing"), true);
    assert.equal(isOpenOrder("Dispatched"), true);
    assert.equal(isOpenOrder("Delivered"), false);
    assert.equal(isOpenOrder("Cancelled"), false);
  });
});

describe("splitDeliveryNote", () => {
  it("says nothing when every line agrees with the headline", () => {
    assert.equal(splitDeliveryNote(["Shipped", "Shipped"]), null);
    assert.equal(splitDeliveryNote(["Pending", "Pending"]), null);
    assert.equal(splitDeliveryNote(["Packed", "Packed", "Packed"]), null);
  });

  it("says nothing for a single-line order, which cannot be split", () => {
    assert.equal(splitDeliveryNote(["Shipped"]), null);
    assert.equal(splitDeliveryNote([]), null);
  });

  it("warns when part of the order has shipped and part has not", () => {
    const note = splitDeliveryNote(["Shipped", "Shipped", "Backordered"]);
    assert.match(note ?? "", /1 of 3 lines is still being sourced/);
    assert.match(note ?? "", /already shipped/);
  });

  it("pluralises the remainder correctly", () => {
    const note = splitDeliveryNote(["Shipped", "Backordered", "Backordered"]);
    assert.match(note ?? "", /2 of 3 lines are still being sourced/);
  });

  it("flags lines still being sourced before anything has shipped", () => {
    const note = splitDeliveryNote(["Packed", "Packed", "Backordered"]);
    assert.match(note ?? "", /1 of 3 lines is still being sourced/);
    assert.ok(!/already shipped/.test(note ?? ""));
  });

  it("never implies a partition it cannot account for", () => {
    // The bug this replaced: "1 of 7 lines have shipped; 1 is still coming"
    // left five picked-and-packed lines unexplained, and a customer counting
    // boxes against that sentence would think four had gone missing.
    const note = splitDeliveryNote([
      "Shipped",
      "Picked",
      "Picked",
      "Packed",
      "Packed",
      "Allocated",
      "Backordered",
    ]);
    assert.match(note ?? "", /1 of 7 lines is still being sourced/);
    assert.ok(!/of 7 lines have shipped/.test(note ?? ""));
  });

  it("ignores cancelled lines, which are not late — they are gone", () => {
    assert.equal(splitDeliveryNote(["Shipped", "Cancelled"]), null);
    assert.equal(splitDeliveryNote(["Shipped", "Shipped", "Cancelled"]), null);
    // The cancelled line must not inflate the denominator either.
    assert.match(
      splitDeliveryNote(["Shipped", "Packed", "Backordered", "Cancelled"]) ?? "",
      /1 of 3 lines/
    );
  });
});
