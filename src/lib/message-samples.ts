import {
  accountChangeDecided,
  applicationDecided,
  applicationReceived,
  emailVerification,
  orderConfirmation,
  orderProgressed,
  purchaseOrderSent,
  quoteReply,
  restockAlert,
  staffAlert,
  taxInvoice,
  type EmailKind,
  type EmailMessage,
} from "./email-message.ts";

/**
 * One realistic example of every message, built from invented data.
 *
 * WHY THIS EXISTS. The template screen has to show three things about a message
 * a person has never seen: what it currently says, what values it can fill in,
 * and what their own version will look like. All three come from actually
 * building one. Describing them in a table instead would be a second
 * description of the emails, kept in step by hand, and it would be wrong within
 * a month.
 *
 * Pure, and importing only email-message.ts, so nothing here can reach the
 * database. The names in it are obviously invented on purpose: a sample that
 * used a real customer would put one on a screen where somebody might copy it
 * into a template and send it to everybody.
 *
 * A kind that is not here, or whose builder publishes no context, simply cannot
 * be overridden — see message-templates.ts.
 */

const WHEN = new Date("2026-08-31T06:30:00Z");

const LINES = [
  {
    name: "Nitrile Examination Gloves, Powder Free, Large",
    skuCode: "GLV-NTR-L",
    unitLabel: "100 Pieces/Box",
    qty: 12,
    lineTotalFils: 22_800,
  },
  {
    name: "Gauze Swabs Non-Sterile 7.5cm",
    skuCode: "GZE-75",
    unitLabel: "Box of 100",
    qty: 4,
    lineTotalFils: 7_360,
  },
];

export function sampleMessage(kind: EmailKind): EmailMessage | null {
  switch (kind) {
    case "OrderConfirmation":
      return orderConfirmation({
        to: "sample@example.com",
        contactName: "Sample Contact",
        reference: "AM-2026-000123",
        placedAt: WHEN,
        lines: LINES,
        subtotalFils: 30_160,
        vatFils: 1_508,
        totalFils: 31_668,
        poReference: "PO-4471",
        placedByName: "Sample Contact",
        branchLabel: "Sample Branch",
      });

    case "OrderProgress":
      return orderProgressed({
        to: "sample@example.com",
        contactName: "Sample Contact",
        reference: "AM-2026-000123",
        status: "Dispatched",
        orderUrl: "https://aussiemed.example/orders/AM-2026-000123",
        courier: "Aramex",
        trackingNumber: "ARX-000000",
        expectedOn: "02 Sep 2026",
        itemsOutstanding: "  4 x Gauze Swabs Non-Sterile 7.5cm (GZE-75)",
      });

    case "TaxInvoice":
      return taxInvoice({
        to: "sample@example.com",
        contactName: "Sample Contact",
        organisationName: "Sample Clinic",
        reference: "AM-2026-000123",
        placedAt: WHEN,
        lines: LINES.map((line) => ({
          name: line.name,
          skuCode: line.skuCode,
          qty: line.qty,
          unitPriceFils: Math.round(line.lineTotalFils / line.qty),
          vatFils: Math.round(line.lineTotalFils * 0.05),
          lineTotalFils: line.lineTotalFils,
          zeroRated: false,
        })),
        standardNetFils: 30_160,
        zeroRatedNetFils: 0,
        vatFils: 1_508,
        totalFils: 31_668,
        vatRatePercent: 5,
        poReference: "PO-4471",
        sellerTrn: "100000000000003",
        buyerTrn: "100000000000004",
        documentUrl: "https://aussiemed.example/orders/AM-2026-000123/tax-invoice",
      });

    case "RestockAlert":
      return restockAlert({
        to: "sample@example.com",
        productName: "Nitrile Examination Gloves, Powder Free, Large",
        skuCode: "GLV-NTR-L",
        unitLabel: "100 Pieces/Box",
        priceFils: 1_900,
        productUrl: "https://aussiemed.example/products/sample",
      });

    case "AccountChangeDecided":
      return accountChangeDecided({
        to: "sample@example.com",
        contactName: "Sample Contact",
        organisationName: "Sample Clinic",
        summary: "Add a delivery branch",
        approved: true,
        decidedAt: WHEN,
        decisionNote: "Added to your account.",
        theirReason: "We have opened a second site.",
      });

    case "QuoteReply":
      return quoteReply({
        to: "sample@example.com",
        contactName: "Sample Contact",
        reference: "AM-Q-2026-0001",
        askedAt: WHEN,
        theirNotes: "What can you do on the larger quantity?",
        reply: "We can do the gloves at AED 18.40 a box, held for 30 days.",
        lines: LINES.map((line) => ({
          name: line.name,
          unitLabel: line.unitLabel,
          qty: line.qty,
        })),
      });

    case "EmailVerification":
      return emailVerification({
        to: "sample@example.com",
        contactName: "Sample Contact",
        code: "000000",
        minutes: 15,
      });

    case "ApplicationReceived":
      return applicationReceived({
        to: "sample@example.com",
        contactName: "Sample Contact",
        companyName: "Sample Clinic",
      });

    case "ApplicationDecided":
      return applicationDecided({
        to: "sample@example.com",
        contactName: "Sample Contact",
        companyName: "Sample Clinic",
        approved: true,
        reason: null,
        signInUrl: "https://aussiemed.example/sign-in",
      });

    case "PurchaseOrderSent":
      // No customer anywhere in this one, sample or not. It is the message the
      // DEC-24 tests are hardest on, and a sample that carried a clinic's name
      // would be the obvious thing for somebody to paste into a template.
      return purchaseOrderSent({
        to: "sample@example.com",
        supplierName: "Sample Supplier",
        poNumber: "PO-2026-000123",
        sentAt: WHEN,
        expectedAt: WHEN,
        lines: LINES.map((line) => ({
          supplierPartNumber: `SUP-${line.skuCode}`,
          skuCode: line.skuCode,
          name: line.name,
          qtyOrdered: line.qty,
        })),
        portalUrl: "https://aussiemed.example/business-portal",
      });

    case "StaffAlert":
      return staffAlert({
        to: "sample@example.com",
        headline: "3 quote requests unanswered",
        detail: "The oldest has been waiting 5 days.",
        url: "https://aussiemed.example/admin/approvals",
      });

    // Written and addressed by a person in the compose form, so there is no
    // automatic wording to rewrite. Its templates are the saved ones.
    case "Forwarded":
      return null;

    default:
      return null;
  }
}
