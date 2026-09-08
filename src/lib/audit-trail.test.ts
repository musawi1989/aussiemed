import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  actionLabel,
  areaLabel,
  areaOf,
  describeChange,
  entityLabel,
  fieldLabel,
  showValue,
} from "./audit-trail.ts";

describe("naming what was changed", () => {
  it("uses the business word, not the model name", () => {
    assert.equal(entityLabel("ProductSku"), "Pack");
    assert.equal(entityLabel("Organisation"), "Account");
  });

  it("falls back to the raw name rather than showing nothing", () => {
    // A model added next week must still appear in the trail.
    assert.equal(entityLabel("SomethingNew"), "SomethingNew");
  });
});

describe("naming what was done", () => {
  it("reads a known action as a sentence", () => {
    assert.equal(actionLabel("sku.tiers"), "Changed the price breaks");
    assert.equal(
      actionLabel("supply.demote.outOfStock"),
      "Demoted a supplier who said they were out of stock"
    );
  });

  it("makes words out of an action nobody has labelled yet", () => {
    // New actions appear whenever somebody adds a screen. Showing nothing
    // would quietly hide the newest changes — the ones worth watching.
    assert.equal(actionLabel("orderLine.batch"), "Recorded a batch and expiry");
    assert.equal(actionLabel("widget.frobnicate"), "Widget frobnicate");
    assert.equal(actionLabel("someThing.doneWell"), "Some thing done well");
  });

  it("groups actions by the part before the dot", () => {
    assert.equal(areaOf("purchaseOrder.send"), "purchaseOrder");
    assert.equal(areaLabel("purchaseOrder.send"), "Purchase orders");
    // No dot: its own area rather than swept into a bucket nobody opens.
    assert.equal(areaOf("AccountChangeApproved"), "AccountChangeApproved");
  });
});

describe("showing a single value", () => {
  it("writes fils as AED, but only where the field is money", () => {
    assert.equal(showValue("priceFils", 1857), "AED 18.57");
    // 1857 is a perfectly ordinary quantity as well as a price.
    assert.equal(showValue("qty", 1857), "1857");
  });

  it("writes booleans as yes and no", () => {
    assert.equal(showValue("isActive", true), "yes");
    assert.equal(showValue("isActive", false), "no");
  });

  it("shows an empty value as a dash rather than the word null", () => {
    for (const empty of [null, undefined, ""]) {
      assert.equal(showValue("anything", empty), "—");
    }
  });

  it("shortens a timestamp to the day", () => {
    // The entry already carries its own time; milliseconds in a diff are noise.
    assert.equal(showValue("paidAt", "2026-08-31T09:15:22.000Z"), "2026-08-31");
  });

  it("summarises a list of rows instead of dumping JSON", () => {
    // This is the case that made the old trail unreadable: price breaks came
    // out as [object Object] → [object Object].
    const out = showValue("tiers", [
      { minQty: 12, priceFils: 1857 },
      { minQty: 48, priceFils: 1640 },
    ]);
    assert.match(out, /from quantity 12, price AED 18\.57/);
    assert.match(out, /from quantity 48, price AED 16\.40/);
  });

  it("says none for an empty list", () => {
    assert.equal(showValue("tiers", []), "none");
  });
});

describe("describing what moved", () => {
  it("lists only the fields that actually differ", () => {
    // An entry recording twelve fields and changing one used to print all
    // twelve, eleven reading "x → x", and the eye slid off the only line
    // that mattered.
    const changes = describeChange(
      JSON.stringify({ status: "Pending", qty: 5, skuCode: "LV-1" }),
      JSON.stringify({ status: "Shipped", qty: 5, skuCode: "LV-1" })
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].field, "Status");
    assert.equal(changes[0].from, "Pending");
    assert.equal(changes[0].to, "Shipped");
  });

  it("marks an addition as an addition", () => {
    const [change] = describeChange(null, JSON.stringify({ trackingNumber: "ARX-1" }));
    assert.ok(change.added);
    assert.ok(!change.removed);
    assert.equal(change.field, "Tracking number");
  });

  it("marks a removal as a removal", () => {
    const [change] = describeChange(JSON.stringify({ trackingNumber: "ARX-1" }), null);
    assert.ok(change.removed);
    assert.ok(!change.added);
  });

  it("survives a blob that is not an object", () => {
    // Some callers record a bare array — the price-break action does.
    const changes = describeChange(JSON.stringify([{ minQty: 12 }]), JSON.stringify([]));
    assert.equal(changes.length, 1);
    assert.equal(changes[0].to, "none");
  });

  it("survives a blob that is not JSON at all", () => {
    const changes = describeChange("not json", null);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].from, "not json");
  });

  it("reports nothing when both sides are empty", () => {
    assert.deepEqual(describeChange(null, null), []);
  });

  it("does not report a field that was empty and stayed empty", () => {
    const changes = describeChange(
      JSON.stringify({ note: null }),
      JSON.stringify({ note: "" })
    );
    assert.deepEqual(changes, []);
  });
});

describe("naming a field", () => {
  it("uses the business word where there is one", () => {
    assert.equal(fieldLabel("qtyConfirmed"), "Confirmed");
    assert.equal(fieldLabel("manualOutOfStock"), "Marked out of stock");
  });

  it("splits camelCase for anything unlabelled", () => {
    assert.equal(fieldLabel("someNewColumn"), "Some new column");
  });
});
