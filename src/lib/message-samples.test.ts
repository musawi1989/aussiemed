import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sampleMessage } from "./message-samples.ts";
import { AUDIENCE, EMAIL_KINDS } from "./email-message.ts";
import { fillPlaceholders } from "./email-templates.ts";

/**
 * The samples are what the template screen shows somebody before they rewrite
 * a message they have never seen, and the placeholder list they work from is
 * derived from the context each one publishes. Both are only as good as this.
 */

describe("every message can be shown and rewritten", () => {
  it("has a sample for every kind except the one written by hand", () => {
    for (const kind of EMAIL_KINDS) {
      const sample = sampleMessage(kind);
      if (kind === "Forwarded") {
        // Composed by a person each time, so there is no automatic wording.
        assert.equal(sample, null, kind);
      } else {
        assert.ok(sample, `${kind} has no sample`);
      }
    }
  });

  it("publishes a context for every sample, or it cannot be overridden", () => {
    for (const kind of EMAIL_KINDS) {
      const sample = sampleMessage(kind);
      if (!sample) continue;
      assert.ok(
        sample.context && Object.keys(sample.context).length > 0,
        `${kind} publishes no context, so the screen offers no placeholders`
      );
    }
  });

  it("gives every sample a subject and a body", () => {
    for (const kind of EMAIL_KINDS) {
      const sample = sampleMessage(kind);
      if (!sample) continue;
      assert.ok(sample.subject.trim().length > 0, `${kind} subject`);
      assert.ok(sample.text.trim().length > 0, `${kind} body`);
    }
  });
});

describe("the placeholders a template author is offered actually work", () => {
  it("resolves every advertised name against its own context", () => {
    // The screen lists Object.keys(context) as the things you can use. If one
    // of them did not resolve, the list would be teaching people to write
    // placeholders that print as {{gibberish}} in a customer's inbox.
    for (const kind of EMAIL_KINDS) {
      const sample = sampleMessage(kind);
      if (!sample?.context) continue;

      for (const name of Object.keys(sample.context)) {
        const out = fillPlaceholders(`[${`{{${name}}}`}]`, sample.context);
        assert.ok(!out.includes("{{"), `${kind}: {{${name}}} did not resolve`);
      }
    }
  });

  it("leaves a name that does not exist exactly as written", () => {
    // No guard, by decision — DEC-40. This asserts the behaviour rather than
    // wishing it away: an unknown placeholder prints, it does not throw and it
    // does not silently vanish, so the mistake is visible in the preview.
    const sample = sampleMessage("OrderConfirmation");
    assert.ok(sample?.context);
    assert.equal(
      fillPlaceholders("{{notARealField}}", sample.context),
      "{{notARealField}}"
    );
  });
});

describe("the samples themselves are safe to put on a screen", () => {
  it("uses obviously invented names, never a real-looking customer", () => {
    // Somebody will paste a sample into a template and send it to everybody.
    for (const kind of EMAIL_KINDS) {
      const sample = sampleMessage(kind);
      if (!sample) continue;
      assert.equal(sample.to, "sample@example.com", kind);
    }
  });

  it("names no customer in the supplier's message", () => {
    // DEC-24, asserted on the sample as well as the real thing: the purchase
    // order sample is the one most likely to be copied into a template.
    const sample = sampleMessage("PurchaseOrderSent");
    assert.ok(sample);
    assert.equal(AUDIENCE[sample.kind], "Supplier");

    const haystack = `${sample.subject}\n${sample.text}\n${JSON.stringify(sample.context)}`;
    for (const forbidden of ["Clinic", "Contact", "AM-2026", "Haddad"]) {
      assert.ok(!haystack.includes(forbidden), `supplier sample mentions ${forbidden}`);
    }
  });
});
