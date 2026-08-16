import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMAIL_TEMPLATES,
  findCustomerLeaks,
  findTemplate,
  templatesFor,
} from "./email-templates.ts";

const ORDER = {
  reference: "AM-2026-000004",
  contactName: "Musawi",
  organisationName: "Al Barsha Family Clinic",
  placedOn: "15 Aug 2026",
  totalLabel: "AED 217.51",
};

const PO = {
  supplierName: "Livingstone",
  poNumber: "PO-2026-000001",
  raisedOn: "16 Aug 2026",
};

describe("the catalogue", () => {
  it("gives every template an id, a label and an audience", () => {
    for (const template of EMAIL_TEMPLATES) {
      assert.ok(template.id.length > 0);
      assert.ok(template.label.length > 3, template.id);
      assert.ok(["Customer", "Supplier"].includes(template.audience), template.id);
    }
  });

  it("has no duplicate ids", () => {
    const ids = EMAIL_TEMPLATES.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("splits cleanly by audience", () => {
    assert.ok(templatesFor("Customer").every((t) => t.audience === "Customer"));
    assert.ok(templatesFor("Supplier").every((t) => t.audience === "Supplier"));
    assert.ok(templatesFor("Customer").length >= 5);
    assert.ok(templatesFor("Supplier").length >= 3);
  });

  it("finds one by id, and nothing by a wrong one", () => {
    assert.equal(findTemplate("order-delayed")?.audience, "Customer");
    assert.equal(findTemplate("nope"), null);
  });
});

describe("every template renders", () => {
  it("produces a subject and a signed body", () => {
    for (const template of EMAIL_TEMPLATES) {
      const draft =
        template.audience === "Customer"
          ? template.render(ORDER)
          : template.render(PO);

      assert.ok(draft.subject.trim().length > 5, template.id);
      assert.match(draft.body, /AussieMed/, template.id);
      assert.match(draft.body, /info@aussiemed\.com/, template.id);
    }
  });

  it("never leaves a mail-merge gap when a name is missing", () => {
    for (const template of EMAIL_TEMPLATES) {
      const draft =
        template.audience === "Customer"
          ? template.render({ reference: "AM-1" })
          : template.render({ poNumber: "PO-1" });

      // "Hello ," reads as a fault; "Hello there," reads as a person.
      assert.ok(!/Hello\s*,/.test(draft.body), template.id);
      assert.ok(!/Dear\s*,/.test(draft.body), template.id);
      assert.ok(!/undefined|null|NaN/.test(draft.body), template.id);
      assert.ok(!/undefined|null/.test(draft.subject), template.id);
    }
  });

  it("leaves out the lines it has nothing to say on", () => {
    const bare = findTemplate("dispatched");
    assert.equal(bare?.audience, "Customer");
    const draft = bare!.audience === "Customer" ? bare!.render({ reference: "AM-1" }) : null!;
    assert.ok(!/Courier:/.test(draft.body));
    assert.ok(!/Tracking:/.test(draft.body));

    const full = bare!.audience === "Customer"
      ? bare!.render({ reference: "AM-1", courier: "Aramex", trackingNumber: "X1" })
      : null!;
    assert.match(full.body, /Courier: Aramex/);
    assert.match(full.body, /Tracking: X1/);
  });

  it("names the order in the subject, which is what gets searched for", () => {
    for (const template of templatesFor("Customer")) {
      if (!template.needsOrder) continue;
      const draft = template.audience === "Customer" ? template.render(ORDER) : null!;
      assert.match(draft.subject, /AM-2026-000004/, template.id);
    }
  });

  it("names the purchase order on every supplier template that needs one", () => {
    for (const template of templatesFor("Supplier")) {
      if (!template.needsOrder) continue;
      const draft = template.audience === "Supplier" ? template.render(PO) : null!;
      assert.match(draft.subject, /PO-2026-000001/, template.id);
    }
  });
});

describe("supplier templates carry no customer", () => {
  it("has no customer context to fill in with in the first place", () => {
    // The leak is prevented by the shape of what these are given, not by
    // remembering. DEC-24.
    for (const template of templatesFor("Supplier")) {
      const draft = template.audience === "Supplier" ? template.render(PO) : null!;
      for (const forbidden of ["Al Barsha", "Musawi", "AM-2026", "clinic"]) {
        assert.ok(
          !new RegExp(forbidden, "i").test(draft.body),
          `${template.id} mentions ${forbidden}`
        );
      }
    }
  });
});

describe("findCustomerLeaks", () => {
  const identifiers = ["Al Barsha Family Clinic", "Musawi", "AM-2026-000004"];

  it("catches a customer named in a supplier's message", () => {
    const body = "Please deliver the gloves for Al Barsha Family Clinic by Friday.";
    assert.deepEqual(findCustomerLeaks(body, identifiers), ["Al Barsha Family Clinic"]);
  });

  it("catches an order reference", () => {
    assert.deepEqual(
      findCustomerLeaks("This is against AM-2026-000004.", identifiers),
      ["AM-2026-000004"]
    );
  });

  it("does not care about case", () => {
    assert.equal(findCustomerLeaks("musawi asked", identifiers).length, 1);
  });

  it("matches whole words, so a supplier is not blocked by a coincidence", () => {
    // A supplier called "Dubai Medical" must not be blocked because a customer
    // is in Dubai.
    assert.deepEqual(findCustomerLeaks("Musawind Trading LLC", identifiers), []);
    assert.deepEqual(findCustomerLeaks("preMusawi", identifiers), []);
  });

  it("ignores identifiers too short to mean anything", () => {
    assert.deepEqual(findCustomerLeaks("a b c ok", ["a", "b", ""]), []);
  });

  it("says nothing about a clean message", () => {
    assert.deepEqual(
      findCustomerLeaks("Please confirm PO-2026-000001 for 12 boxes.", identifiers),
      []
    );
  });

  it("reports each identifier once, however often it appears", () => {
    const body = "Musawi said. Musawi again. Musawi.";
    assert.deepEqual(findCustomerLeaks(body, identifiers), ["Musawi"]);
  });

  it("is not confused by regex characters in a customer's name", () => {
    assert.deepEqual(
      findCustomerLeaks("An order for A+B (Dubai) today", ["A+B (Dubai)"]),
      ["A+B (Dubai)"]
    );
  });
});
