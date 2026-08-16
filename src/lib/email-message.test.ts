import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUDIENCE,
  EMAIL_KINDS,
  accountChangeDecided,
  aed,
  dubaiDate,
  dubaiDateTime,
  isSendableAddress,
  orderConfirmation,
  purchaseOrderSent,
  forwarded,
  restockAlert,
  staffAlert,
  taxInvoice,
} from "./email-message.ts";
import { formatAED } from "./money.ts";

const ORDER = {
  to: "procurement@albarshaclinic.example",
  contactName: "Musawi",
  reference: "AM-2026-000004",
  placedAt: new Date("2026-08-15T23:30:00Z"),
  lines: [
    {
      name: "Nitrile Examination Gloves, Large",
      skuCode: "GLV-NIT-L",
      unitLabel: "100 Pieces/Box",
      qty: 4,
      lineTotalFils: 11_392,
    },
  ],
  subtotalFils: 11_392,
  vatFils: 570,
  totalFils: 11_962,
};

describe("addresses", () => {
  it("accepts the ordinary ones", () => {
    for (const address of [
      "info@aussiemed.com",
      "procurement@albarshaclinic.example",
      "a.b+tag@sub.domain.co.uk",
    ]) {
      assert.equal(isSendableAddress(address), true, address);
    }
  });

  it("rejects what is obviously not an address", () => {
    for (const bad of [
      "",
      "   ",
      null,
      undefined,
      "nobody",
      "no@domain",
      "@aussiemed.com",
      "info@",
      "in fo@aussiemed.com",
      "info@aussiemed..com",
      "info@.com",
      "info@aussiemed.",
    ]) {
      assert.equal(isSendableAddress(bad as string), false, String(bad));
    }
  });

  it("is permissive rather than clever", () => {
    // Not our job to out-guess the mail server. The cost of a false reject is
    // a customer never told their order was received.
    assert.equal(isSendableAddress("weird!but#legal@example.com"), true);
  });
});

describe("formatting", () => {
  it("agrees with money.ts, which is what stops the two drifting", () => {
    for (const fils of [0, 1, 50, 999, 1_000, 11_392, 123_456_789, -4_500]) {
      assert.equal(aed(fils), formatAED(fils / 100), String(fils));
    }
  });

  it("never renders a localised currency symbol", () => {
    assert.match(aed(3_597), /^AED /);
    assert.ok(!aed(3_597).includes("د.إ"));
  });

  it("writes the reader's own day, not UTC's", () => {
    // 23:30 UTC on the 15th is 03:30 on the 16th in Dubai. Telling a clinic
    // the 15th is telling them the wrong day, and cutoffs turn on it.
    const late = new Date("2026-08-15T23:30:00Z");
    assert.match(dubaiDate(late), /16 Aug 2026/);
    assert.match(dubaiDateTime(late), /16 Aug 2026, 03:30/);
  });

  it("uses a 24-hour clock so 03:30 cannot be read as the afternoon", () => {
    assert.ok(!/am|pm/i.test(dubaiDateTime(new Date("2026-08-15T23:30:00Z"))));
  });
});

describe("order confirmation", () => {
  const message = orderConfirmation(ORDER);

  it("puts the reference in the subject, which is what gets searched for", () => {
    assert.match(message.subject, /AM-2026-000004/);
  });

  it("says reference number, never order number", () => {
    // Platform convention, and the phrase used on every other document.
    assert.match(message.text, /Reference number: AM-2026-000004/);
    assert.ok(!/order number/i.test(message.text));
  });

  it("shows VAT separately from the subtotal", () => {
    assert.match(message.text, /Subtotal\s+AED 113\.92/);
    assert.match(message.text, /VAT\s+AED 5\.70/);
    assert.match(message.text, /Total\s+AED 119\.62/);
  });

  it("lists what was ordered with its own code and unit", () => {
    assert.match(message.text, /4 x Nitrile Examination Gloves, Large/);
    assert.match(message.text, /GLV-NIT-L · 100 Pieces\/Box/);
  });

  it("includes their own PO reference when they gave one", () => {
    assert.ok(!/Your PO/.test(message.text));
    const withPo = orderConfirmation({ ...ORDER, poReference: "PO-99123" });
    assert.match(withPo.text, /Your PO: PO-99123/);
  });

  it("names who placed it and where it is going when known", () => {
    const full = orderConfirmation({
      ...ORDER,
      placedByName: "Dr Reem Haddad",
      branchLabel: "Jumeirah clinic",
    });
    assert.match(full.text, /Ordered by: Dr Reem Haddad/);
    assert.match(full.text, /Delivering to: Jumeirah clinic/);
  });

  it("does not leave a dangling greeting when there is no name", () => {
    const anon = orderConfirmation({ ...ORDER, contactName: "" });
    assert.match(anon.text, /Hello there,/);
  });
});

describe("restock alert", () => {
  const message = restockAlert({
    to: "someone@example.com",
    productName: "Nitrile Examination Gloves, Large",
    skuCode: "GLV-NIT-L",
    unitLabel: "100 Pieces/Box",
    priceFils: 2_848,
    productUrl: "https://aussiemed.com/products/nitrile-gloves-large",
  });

  it("names the product in the subject", () => {
    assert.match(message.subject, /Back in stock: Nitrile Examination Gloves/);
  });

  it("says the price excludes VAT rather than leaving it ambiguous", () => {
    assert.match(message.text, /AED 28\.48 excluding VAT/);
  });

  it("says this is the only one, because it is", () => {
    // Notify Me fires once per subscription; promising a subscription the
    // system does not have would be a promise it cannot keep.
    assert.match(message.text, /the one email you get/i);
    assert.match(message.text, /nothing to unsubscribe/i);
  });
});

describe("account change decided", () => {
  const base = {
    to: "musawi@example.com",
    contactName: "Musawi",
    organisationName: "Al Barsha Family Clinic",
    summary: "Add branch Jumeirah surgery",
    decidedAt: new Date("2026-08-16T09:00:00Z"),
    theirReason: "We have opened a second surgery",
  };

  it("says plainly which way it went, in the subject", () => {
    assert.match(accountChangeDecided({ ...base, approved: true }).subject, /approved$/);
    assert.match(
      accountChangeDecided({ ...base, approved: false }).subject,
      /not approved$/
    );
  });

  it("carries our reason when we turned it down", () => {
    const no = accountChangeDecided({
      ...base,
      approved: false,
      decisionNote: "We could not reach anyone to confirm the address",
    });
    assert.match(no.text, /Our note: We could not reach anyone/);
    assert.match(no.text, /Nothing on your account has changed/);
  });

  it("quotes back what they told us, so the thread makes sense alone", () => {
    assert.match(
      accountChangeDecided({ ...base, approved: true }).text,
      /You told us: We have opened a second surgery/
    );
  });

  it("does not invite a reply when the answer was yes", () => {
    const yes = accountChangeDecided({ ...base, approved: true });
    assert.match(yes.text, /live on your account now/);
    assert.ok(!/look again/.test(yes.text));
  });
});

describe("purchase order to a supplier", () => {
  const message = purchaseOrderSent({
    to: "orders@livingstone.example",
    supplierName: "Livingstone",
    poNumber: "PO-2026-000001",
    sentAt: new Date("2026-08-16T06:00:00Z"),
    expectedAt: new Date("2026-08-19T06:00:00Z"),
    lines: [
      {
        supplierPartNumber: "LIV-88231",
        skuCode: "GLV-NIT-L",
        name: "Nitrile Examination Gloves, Large",
        qtyOrdered: 12,
      },
      {
        supplierPartNumber: null,
        skuCode: "SYR-3ML",
        name: "Syringe 3ml",
        qtyOrdered: 5,
      },
    ],
    portalUrl: "https://aussiemed.com/business-portal",
  });

  it("leads with the supplier's own code and keeps ours as a reference", () => {
    assert.match(message.text, /12 x LIV-88231/);
    assert.match(message.text, /our ref GLV-NIT-L/);
  });

  it("falls back to our code when they have not given us theirs", () => {
    assert.match(message.text, /5 x SYR-3ML/);
  });

  it("names no customer — not a name, an address, or an order reference", () => {
    // DEC-24. This is the model, not a detail of the layout.
    for (const forbidden of [
      "Al Barsha",
      "Musawi",
      "AM-2026",
      "Jumeirah",
      "clinic",
      "customer",
      "Dubai",
    ]) {
      assert.ok(
        !new RegExp(forbidden, "i").test(message.text),
        `purchase order email mentions "${forbidden}"`
      );
    }
  });

  it("does not say how many customers are behind the quantity", () => {
    // Pooling the day's demand is what makes anonymity possible; a count of
    // orders would undo it.
    assert.ok(!/\border(s)?\b(?!\s+(PO-|number))/i.test(message.text.replace(/purchase order/gi, "")));
  });

  it("tells them where to acknowledge, which is the whole point of sending it", () => {
    assert.match(message.text, /business-portal/);
    assert.match(message.text, /acknowledge/i);
  });

  it("carries no prices at all, not even a note about how we show them", () => {
    // The document is quantities and codes. A line about how our prices are
    // presented is noise here at best, and an invitation to ask at worst.
    assert.ok(!/AED/.test(message.text));
    assert.ok(!/VAT/i.test(message.text));
  });
});

describe("staff alert", () => {
  it("is internal and carries a link to the queue", () => {
    const message = staffAlert({
      to: "info@aussiemed.com",
      headline: "2 account changes waiting",
      detail: "Branches and account names a customer has asked to change.",
      url: "https://aussiemed.com/admin/approvals",
    });
    assert.match(message.subject, /^AussieMed: 2 account changes waiting$/);
    assert.match(message.text, /admin\/approvals/);
    assert.equal(AUDIENCE[message.kind], "Staff");
  });
});

describe("every kind", () => {
  it("has an audience, so nothing is sent without knowing who reads it", () => {
    for (const kind of EMAIL_KINDS) {
      assert.ok(AUDIENCE[kind], kind);
    }
  });

  it("signs off as AussieMed with a reply address", () => {
    const all = [
      orderConfirmation(ORDER),
      restockAlert({
        to: "a@b.com",
        productName: "X",
        skuCode: "X",
        unitLabel: "Each",
        priceFils: 100,
        productUrl: "https://x",
      }),
      staffAlert({ to: "a@b.com", headline: "h", detail: "d", url: "https://x" }),
      purchaseOrderSent({
        to: "a@b.com",
        supplierName: "S",
        poNumber: "PO-1",
        sentAt: new Date("2026-08-16T06:00:00Z"),
        lines: [],
        portalUrl: "https://x",
      }),
    ];
    for (const message of all) {
      assert.match(message.text, /AussieMed/);
      assert.match(message.text, /info@aussiemed\.com/);
    }
  });

  it("never leaves an empty subject, which reads as spam", () => {
    assert.ok(orderConfirmation(ORDER).subject.trim().length > 5);
  });
});

describe("tax invoice", () => {
  const base = {
    to: "accounts@albarshaclinic.example",
    contactName: "Musawi",
    organisationName: "Al Barsha Family Clinic",
    reference: "AM-2026-000004",
    placedAt: new Date("2026-08-15T06:00:00Z"),
    lines: [
      {
        name: "Nitrile Gloves, Large",
        skuCode: "GLV-NIT-L",
        qty: 4,
        unitPriceFils: 2_848,
        vatFils: 570,
        lineTotalFils: 11_392,
        zeroRated: false,
      },
      {
        name: "BD Insulin Syringes",
        skuCode: "BD326103",
        qty: 1,
        unitPriceFils: 8_458,
        vatFils: 0,
        lineTotalFils: 8_458,
        zeroRated: true,
      },
    ],
    standardNetFils: 11_392,
    zeroRatedNetFils: 8_458,
    vatFils: 570,
    totalFils: 20_420,
    vatRatePercent: 5,
    documentUrl: "https://aussiemed.com/admin/orders/AM-2026-000004/tax-invoice",
  };

  it("subtotals the two bases separately", () => {
    // On a UAE tax invoice the split between standard-rated and zero-rated
    // supply is the part an auditor reads; one combined VAT figure hides it.
    const message = taxInvoice(base);
    assert.match(message.text, /Standard rated\s+AED 113\.92/);
    assert.match(message.text, /Zero rated\s+AED 84\.58/);
    assert.match(message.text, /VAT at 5%\s+AED 5\.70/);
    assert.match(message.text, /Total\s+AED 204\.20/);
  });

  it("marks the zero-rated line as such", () => {
    assert.match(taxInvoice(base).text, /BD326103[\s\S]*zero rated/);
  });

  it("admits it is not compliant when a TRN is missing", () => {
    // A document that presents itself as a tax invoice and is not one is worse
    // than one that admits the gap — the customer may file it. AC-03.
    const neither = taxInvoice(base);
    assert.match(neither.text, /not a compliant/i);
    assert.match(neither.text, /Our TRN: not yet issued/);
    assert.match(neither.text, /Your TRN: not on file/);

    const onlyOurs = taxInvoice({ ...base, sellerTrn: "100123456700003" });
    assert.match(onlyOurs.text, /not a compliant/i);
  });

  it("drops the warning once both TRNs are held", () => {
    const compliant = taxInvoice({
      ...base,
      sellerTrn: "100123456700003",
      buyerTrn: "100999888700003",
    });
    assert.ok(!/not a compliant/i.test(compliant.text));
    assert.match(compliant.text, /Our TRN: 100123456700003/);
    assert.match(compliant.text, /Your TRN: 100999888700003/);
  });

  it("says reference number and never order number", () => {
    assert.match(taxInvoice(base).text, /Reference number: AM-2026-000004/);
    assert.ok(!/order number/i.test(taxInvoice(base).text));
  });

  it("names no supplier", () => {
    for (const forbidden of ["Livingstone", "Chemist Warehouse", "supplier"]) {
      assert.ok(!new RegExp(forbidden, "i").test(taxInvoice(base).text), forbidden);
    }
  });

  it("links to the printable version", () => {
    assert.match(taxInvoice(base).text, /tax-invoice/);
  });
});

describe("forwarded", () => {
  const item = {
    to: "someone@example.com",
    subject: "Account change waiting",
    body: "Al Barsha Family Clinic asked to remove a branch.",
  };

  it("passes the original wording through unchanged", () => {
    // The person forwarding has read that text and is vouching for it.
    // Rewriting it means they sent one thing and the recipient got another.
    assert.match(forwarded(item).text, /Al Barsha Family Clinic asked to remove a branch\./);
    assert.equal(forwarded(item).subject, "Account change waiting");
  });

  it("puts their note above the original, not mixed into it", () => {
    const message = forwarded({ ...item, note: "Can you call them?" });
    const noteAt = message.text.indexOf("Can you call them?");
    const bodyAt = message.text.indexOf("Al Barsha");
    assert.ok(noteAt >= 0 && noteAt < bodyAt);
  });

  it("leaves no empty note block when there is no note", () => {
    assert.ok(!/^\s*\n\s*-{10,}\s*\n\s*Al Barsha/.test(forwarded(item).text));
  });

  it("adds the link when there is one", () => {
    const message = forwarded({ ...item, link: "https://aussiemed.com/admin/approvals" });
    assert.match(message.text, /admin\/approvals/);
  });
});

describe("invoice column alignment", () => {
  it("lines the figures up whatever the VAT rate is called", () => {
    // A monospaced client shows these as a column; a hand-counted run of
    // spaces breaks the moment the rate changes from 5% to 15%.
    const at = (rate: number) =>
      taxInvoice({
        to: "a@b.com",
        contactName: "X",
        organisationName: "Y",
        reference: "AM-1",
        placedAt: new Date("2026-08-15T06:00:00Z"),
        lines: [],
        standardNetFils: 10_000,
        zeroRatedNetFils: 0,
        vatFils: 500,
        totalFils: 10_500,
        vatRatePercent: rate,
        documentUrl: "https://x",
      }).text;

    for (const rate of [5, 15, 12.5]) {
      const columns = at(rate)
        .split("\n")
        .filter((l) => /^ {2}(Standard rated|Zero rated|VAT at|Total)/.test(l))
        .map((l) => l.indexOf("AED"));
      assert.equal(new Set(columns).size, 1, `rate ${rate} misaligned: ${columns}`);
    }
  });
});
