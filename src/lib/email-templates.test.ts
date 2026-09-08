import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fillPlaceholders, unknownPlaceholders,
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

describe("the item lists are actually filled in", () => {
  const withItems = {
    reference: "AM-2026-000004",
    contactName: "Musawi",
    itemsAll: "  4 x Nitrile Gloves (GLV-L)\n  1 x Syringes (SYR-3)",
    itemsShipped: "  4 x Nitrile Gloves (GLV-L)",
    itemsOutstanding: "  1 x Syringes (SYR-3)",
  };

  it("names what is late on a delay, not the whole order", () => {
    const t = findTemplate("order-delayed")!;
    const draft = t.audience === "Customer" ? t.render(withItems) : null!;
    assert.match(draft.body, /Still to come:\n {2}1 x Syringes/);
    assert.ok(!/Nitrile Gloves/.test(draft.body));
  });

  it("falls back to the whole order when nothing has shipped", () => {
    const t = findTemplate("order-delayed")!;
    const draft =
      t.audience === "Customer"
        ? t.render({ ...withItems, itemsOutstanding: null })
        : null!;
    assert.match(draft.body, /On the order:\n {2}4 x Nitrile Gloves/);
  });

  it("separates what went from what follows on a part shipment", () => {
    const t = findTemplate("part-shipped")!;
    const draft = t.audience === "Customer" ? t.render(withItems) : null!;
    const went = draft.body.indexOf("On its way:");
    const follows = draft.body.indexOf("Still to follow:");
    assert.ok(went >= 0 && follows > went);
    assert.match(draft.body, /On its way:\n {2}4 x Nitrile Gloves/);
    assert.match(draft.body, /Still to follow:\n {2}1 x Syringes/);
  });

  it("drops the heading entirely when there is no list", () => {
    // "On its way: ." is worse than saying nothing.
    const t = findTemplate("part-shipped")!;
    const draft =
      t.audience === "Customer" ? t.render({ reference: "AM-1" }) : null!;
    assert.ok(!/On its way:/.test(draft.body));
    assert.ok(!/Still to follow:/.test(draft.body));
  });

  it("ignores a list that is only whitespace", () => {
    const t = findTemplate("part-shipped")!;
    const draft =
      t.audience === "Customer"
        ? t.render({ reference: "AM-1", itemsShipped: "   \n  " })
        : null!;
    assert.ok(!/On its way:/.test(draft.body));
  });

  it("lists what a supplier still owes us, not everything", () => {
    const t = findTemplate("chase-delivery")!;
    const draft =
      t.audience === "Supplier"
        ? t.render({
            poNumber: "PO-1",
            itemsAll: "  12 x Gloves (LIV-1)\n  5 x Syringes (LIV-2)",
            itemsOutstanding: "  5 x Syringes (LIV-2)",
          })
        : null!;
    assert.match(draft.body, /Outstanding:\n {2}5 x Syringes/);
    assert.ok(!/12 x Gloves/.test(draft.body));
  });
});

describe("the wording agrees with the list under it", () => {
  const one = "  1 x Hand Sanitiser (TS-1032)";
  const two = `${one}\n  1 x Syringes (BD326103)`;

  it("says one item when one item is listed", () => {
    const t = findTemplate("item-unavailable")!;
    const draft =
      t.audience === "Customer"
        ? t.render({ reference: "AM-1", itemsBackordered: one })
        : null!;
    assert.match(draft.body, /One item on order AM-1 cannot be supplied/);
    assert.match(draft.body, /The item:\n {2}1 x Hand Sanitiser/);
  });

  it("says some items when more than one is listed", () => {
    // "One item cannot be supplied" followed by six lines is an email that
    // contradicts itself in three lines.
    const t = findTemplate("item-unavailable")!;
    const draft =
      t.audience === "Customer"
        ? t.render({ reference: "AM-1", itemsBackordered: two })
        : null!;
    assert.match(draft.body, /Some items on order AM-1 cannot be supplied/);
  });

  it("lists only what cannot be supplied, not everything outstanding", () => {
    const t = findTemplate("item-unavailable")!;
    const draft =
      t.audience === "Customer"
        ? t.render({
            reference: "AM-1",
            itemsBackordered: one,
            itemsOutstanding: "  1 x Something Else (X)",
            itemsAll: "  9 x Everything (Y)",
          })
        : null!;
    assert.match(draft.body, /Hand Sanitiser/);
    assert.ok(!/Something Else/.test(draft.body));
    assert.ok(!/Everything/.test(draft.body));
  });

  it("leaves exactly one blank line after a list, never two", () => {
    for (const [id, context] of [
      ["item-unavailable", { reference: "AM-1", itemsBackordered: one }],
      ["order-delayed", { reference: "AM-1", itemsAll: one }],
      ["part-shipped", { reference: "AM-1", itemsShipped: one }],
    ] as const) {
      const t = findTemplate(id)!;
      const draft = t.audience === "Customer" ? t.render(context) : null!;
      assert.ok(!/\n\n\n/.test(draft.body), `${id} has a double gap`);
    }
  });

  it("keeps every item indented the same, including the first", () => {
    const t = findTemplate("part-shipped")!;
    const draft =
      t.audience === "Customer"
        ? t.render({ reference: "AM-1", itemsShipped: two })
        : null!;
    const listedLines = draft.body
      .split("\n")
      .filter((l) => /\d+ x /.test(l))
      .map((l) => l.match(/^\s*/)![0].length);
    assert.equal(new Set(listedLines).size, 1, `ragged indents: ${listedLines}`);
  });
});

describe("fillPlaceholders", () => {
  const ctx = { reference: "AM-2026-000021", courier: "Aramex", trackingNumber: null };

  it("fills what it knows", () => {
    assert.equal(fillPlaceholders("Order {{reference}}", ctx), "Order AM-2026-000021");
  });

  it("allows spaces inside the braces, because people type them", () => {
    assert.equal(fillPlaceholders("Order {{ reference }}", ctx), "Order AM-2026-000021");
  });

  it("empties a known key that has nothing in it", () => {
    // "Tracking: null" is worse than "Tracking:".
    assert.equal(fillPlaceholders("Tracking: {{trackingNumber}}", ctx), "Tracking: ");
  });

  it("leaves a key it does not know exactly as typed", () => {
    // A mistake somebody can see and fix, rather than a gap they cannot.
    assert.equal(fillPlaceholders("Price {{price}}", ctx), "Price {{price}}");
  });

  it("leaves ordinary prose with braces alone", () => {
    assert.equal(fillPlaceholders("Use {this} form", ctx), "Use {this} form");
  });

  it("fills the same key more than once", () => {
    assert.equal(
      fillPlaceholders("{{courier}} — {{courier}}", ctx),
      "Aramex — Aramex"
    );
  });
});

describe("unknownPlaceholders", () => {
  it("names what nothing will fill", () => {
    assert.deepEqual(
      unknownPlaceholders("{{reference}} and {{price}}", ["reference"]),
      ["price"]
    );
  });

  it("says nothing when every key is known", () => {
    assert.deepEqual(unknownPlaceholders("{{reference}}", ["reference"]), []);
  });

  it("reports a repeated unknown once", () => {
    assert.deepEqual(unknownPlaceholders("{{a}} {{a}}", []), ["a"]);
  });
});
