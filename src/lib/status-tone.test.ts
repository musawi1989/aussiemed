import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DUE_SOON_DAYS,
  TONES,
  deliveryStatusOf,
  isKnownStatus,
  legend,
  needsAttention,
  orderTones,
  paymentStatusOf,
  spaceOut,
  statusMeaning,
  statusTone,
  type Axis,
  type Tone,
} from "./status-tone.ts";

const NOW = new Date("2026-08-17T09:00:00.000Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("the five tones", () => {
  it("gives every tone a glyph, a meaning and classes", () => {
    for (const [name, tone] of Object.entries(TONES)) {
      assert.ok(tone.glyph.length > 0, name);
      assert.ok(tone.meaning.length > 10, name);
      for (const key of ["pill", "text", "rail", "dot"] as const) {
        assert.ok(tone[key].length > 0, `${name}.${key}`);
      }
    }
  });

  it("uses a different glyph for each tone", () => {
    // The colour is the fast signal; the glyph is the only one for a reader
    // who cannot separate red from green, or for a mono office printer. Two
    // tones sharing a glyph would put those readers back where they started.
    const glyphs = Object.values(TONES).map((t) => t.glyph);
    assert.equal(new Set(glyphs).size, glyphs.length);
  });

  it("uses a different colour for each tone", () => {
    const pills = Object.values(TONES).map((t) => t.pill);
    assert.equal(new Set(pills).size, pills.length);
  });
});

/* ------------------------------------------------------------------ *
 * The guard that matters: nothing in the schema goes uncoloured
 * ------------------------------------------------------------------ */

describe("every status the database can hold is mapped", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");

  /** Pulls "A | B | C" off the schema comment that documents a status. */
  const documented = (marker: string): string[] => {
    const line = schema
      .split(/\r?\n/)
      .find((l) => l.includes("///") && l.includes(marker) && l.includes("|"));
    assert.ok(line, `no schema comment found containing ${marker}`);
    return line!
      .slice(line!.indexOf(":") + 1)
      .split("|")
      .map((w) => w.trim())
      .filter(Boolean);
  };

  const CASES: { marker: string; axis: Axis; what: string }[] = [
    { marker: "Pending | Processing | Dispatched", axis: "fulfilment", what: "an order" },
    { marker: "Backordered", axis: "fulfilment", what: "an order line" },
    { marker: "PartiallyReceived", axis: "fulfilment", what: "a purchase order" },
    { marker: "PartiallyPaid", axis: "payment", what: "payment" },
  ];

  for (const { marker, axis, what } of CASES) {
    it(`knows every status ${what} can be in`, () => {
      const words = documented(marker);
      assert.ok(words.length >= 4, `${what}: only found ${words.join(", ")}`);
      for (const word of words) {
        assert.ok(
          isKnownStatus(axis, word),
          `${what} can be "${word}" and status-tone.ts has no entry for it ` +
            `on the ${axis} axis — add one rather than letting it fall to grey`
        );
      }
    });
  }

  it("was the actual bug: Overdue and Draft must not look the same", () => {
    // The whole reason this module exists. Both used to land on the default
    // grey, so an invoice past its due date was rendered exactly like a
    // purchase order nobody had sent yet.
    assert.notEqual(
      statusTone("payment", "Overdue"),
      statusTone("fulfilment", "Draft")
    );
    assert.equal(statusTone("payment", "Overdue"), "stopped");
    assert.equal(statusTone("fulfilment", "Draft"), "resting");
  });
});

describe("reading a status", () => {
  it("turns a database word into words a person reads", () => {
    assert.equal(statusMeaning("payment", "PartiallyPaid").label, "Part paid");
    assert.equal(spaceOut("PendingApproval"), "Pending Approval");
  });

  it("keeps the word when it has no entry, rather than saying Unknown", () => {
    const meaning = statusMeaning("payment", "Escheated");
    assert.equal(meaning.label, "Escheated");
    assert.equal(meaning.tone, "resting");
  });

  it("does not guess a tone from the shape of an unknown word", () => {
    // A new status called "Failed" quietly coloured green would be a lie. Grey
    // and obviously unstyled is a prompt to come and map it.
    assert.equal(statusTone("fulfilment", "Failed"), "resting");
    assert.equal(statusTone("payment", "Exploded"), "resting");
  });

  it("gives the same word the same tone on every axis that has it", () => {
    // "Cancelled" must not be red on an order and grey on a delivery.
    assert.equal(statusTone("fulfilment", "Cancelled"), "stopped");
    assert.equal(statusTone("delivery", "Cancelled"), "stopped");
    assert.equal(statusTone("fulfilment", "Delivered"), "complete");
    assert.equal(statusTone("delivery", "Delivered"), "complete");
  });

  it("lists a legend from calm to alarming", () => {
    const tones = legend("payment").map((l) => l.tone);
    const rank: Record<Tone, number> = {
      resting: 0, active: 1, attention: 2, complete: 3, stopped: 4,
    };
    for (let i = 1; i < tones.length; i++) {
      assert.ok(rank[tones[i]!] >= rank[tones[i - 1]!], tones.join(" "));
    }
    assert.ok(legend("fulfilment").length >= 12);
    assert.ok(legend("delivery").length >= 5);
  });
});

/* ------------------------------------------------------------------ *
 * Delivery
 * ------------------------------------------------------------------ */

describe("where the parcel is", () => {
  it("is not on the road before it is dispatched", () => {
    assert.equal(deliveryStatusOf({ status: "Pending" }), "Preparing");
    assert.equal(
      deliveryStatusOf({ status: "Processing" }),
      "AwaitingCourier"
    );
  });

  it("is in transit once dispatched with a courier", () => {
    assert.equal(
      deliveryStatusOf({ status: "Dispatched", courier: "Aramex" }),
      "InTransit"
    );
    assert.equal(
      deliveryStatusOf({ status: "Dispatched", trackingNumber: "X1" }),
      "InTransit"
    );
  });

  it("flags a dispatch nobody can trace", () => {
    // The customer rings to ask where their gloves are and there is no answer.
    // Blue on the goods, amber on the delivery — the two axes disagreeing here
    // is the system working.
    const untraceable = { status: "Dispatched", courier: "  ", trackingNumber: "" };
    assert.equal(deliveryStatusOf(untraceable), "InTransitUntracked");
    assert.equal(statusTone("delivery", "InTransitUntracked"), "attention");
    assert.equal(statusTone("fulfilment", "Dispatched"), "active");
  });

  it("sends a pick-up to the counter, never to a courier", () => {
    assert.equal(
      deliveryStatusOf({ status: "Dispatched", deliveryType: "PickUp" }),
      "ReadyForPickUp"
    );
    assert.equal(
      deliveryStatusOf({ status: "Processing", deliveryType: "PickUp" }),
      "Preparing"
    );
  });

  it("lets cancelled and delivered beat everything else", () => {
    assert.equal(
      deliveryStatusOf({ status: "Cancelled", courier: "Aramex" }),
      "Cancelled"
    );
    assert.equal(
      deliveryStatusOf({ status: "Delivered", deliveryType: "PickUp" }),
      "Delivered"
    );
  });
});

/* ------------------------------------------------------------------ *
 * Payment
 * ------------------------------------------------------------------ */

describe("whether the money is late", () => {
  it("is calm when nothing is due yet", () => {
    const status = paymentStatusOf(
      { paymentStatus: "Unpaid", paymentDueOn: inDays(30) },
      NOW
    );
    assert.equal(status, "Unpaid");
    assert.equal(statusTone("payment", status), "resting");
  });

  it("goes overdue on the date, with no nightly job to forget", () => {
    // paymentStatus is a stored word and nothing rewrites it at midnight. Left
    // to the column alone, yesterday's due date still reads a calm grey.
    const status = paymentStatusOf(
      { paymentStatus: "Unpaid", paymentDueOn: inDays(-1) },
      NOW
    );
    assert.equal(status, "Overdue");
    assert.equal(statusTone("payment", status), "stopped");
  });

  it("warns the week before", () => {
    assert.equal(
      paymentStatusOf({ paymentStatus: "Unpaid", paymentDueOn: inDays(3) }, NOW),
      "DueSoon"
    );
    assert.equal(
      paymentStatusOf(
        { paymentStatus: "Unpaid", paymentDueOn: inDays(DUE_SOON_DAYS + 1) },
        NOW
      ),
      "Unpaid"
    );
  });

  it("does not downgrade a part payment to a reminder", () => {
    // "Part paid" already means a person is needed; "Due soon" would be a
    // step backwards from that.
    assert.equal(
      paymentStatusOf(
        { paymentStatus: "PartiallyPaid", paymentDueOn: inDays(2) },
        NOW
      ),
      "PartiallyPaid"
    );
  });

  it("never calls a settled invoice late", () => {
    for (const settled of ["Paid", "Refunded"]) {
      assert.equal(
        paymentStatusOf({ paymentStatus: settled, paymentDueOn: inDays(-99) }, NOW),
        settled
      );
    }
  });

  it("honours a person's judgement over the arithmetic", () => {
    assert.equal(
      paymentStatusOf(
        { paymentStatus: "Overdue", paymentDueOn: inDays(99) },
        NOW
      ),
      "Overdue"
    );
  });

  it("leaves an order with no due date exactly as stored", () => {
    assert.equal(
      paymentStatusOf({ paymentStatus: "Unpaid", paymentDueOn: null }, NOW),
      "Unpaid"
    );
  });
});

/* ------------------------------------------------------------------ *
 * All three together
 * ------------------------------------------------------------------ */

describe("the three axes together", () => {
  it("shows delivered and overdue at the same time", () => {
    // The pairing that matters: the goods are gone and the money is late. It
    // only stands out if both are on screen.
    const tones = orderTones(
      {
        status: "Delivered",
        paymentStatus: "Unpaid",
        paymentDueOn: inDays(-10),
      },
      NOW
    );
    assert.equal(tones.fulfilment.tone, "complete");
    assert.equal(tones.delivery.tone, "complete");
    assert.equal(tones.payment.tone, "stopped");
  });

  it("says nothing needs attention on a healthy order", () => {
    assert.deepEqual(
      needsAttention(
        {
          status: "Processing",
          paymentStatus: "Unpaid",
          paymentDueOn: inDays(30),
        },
        NOW
      ),
      []
    );
  });

  it("reports each reason an order wants a person", () => {
    const reasons = needsAttention(
      {
        status: "Dispatched",
        courier: null,
        trackingNumber: null,
        paymentStatus: "Unpaid",
        paymentDueOn: inDays(-3),
      },
      NOW
    );
    assert.equal(reasons.length, 2);
    assert.ok(reasons.some((r) => /where it is/.test(r)));
    assert.ok(reasons.some((r) => /Chase it/.test(r)));
  });

  it("counts a cancelled order as wanting attention on the goods", () => {
    const reasons = needsAttention(
      { status: "Cancelled", paymentStatus: "Refunded" },
      NOW
    );
    assert.equal(reasons.length, 2); // fulfilment and delivery both stopped
  });
});
