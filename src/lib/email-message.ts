/**
 * What AussieMed's emails say.
 *
 * Pure: no database, no network, no imports. Every message is a function from
 * plain data to a subject and a body, so the wording can be tested without a
 * mail server and cannot change depending on what is in the database.
 *
 * Platform conventions are enforced here rather than remembered at each call
 * site: amounts are AED in English with two decimals, VAT is shown separately,
 * a customer's order is identified by its **reference number** and never by an
 * "order number", and times are written in Asia/Dubai because that is where
 * the person reading it is.
 *
 * Two rules are not style, they are the model, and both are tested:
 *   - nothing sent to a customer names a supplier
 *   - nothing sent to a supplier names a customer
 */

export const EMAIL_KINDS = [
  "OrderConfirmation",
  "RestockAlert",
  "AccountChangeDecided",
  "PurchaseOrderSent",
  "StaffAlert",
  "TaxInvoice",
  "Forwarded",
  "EmailVerification",
  "ApplicationReceived",
  "ApplicationDecided",
  "OrderProgress",
] as const;

export type EmailKind = (typeof EMAIL_KINDS)[number];

export type Recipient = "Customer" | "Supplier" | "Staff";

/** Who each kind is written for. Used to pick the right leak test. */
export const AUDIENCE: Record<EmailKind, Recipient> = {
  OrderConfirmation: "Customer",
  RestockAlert: "Customer",
  AccountChangeDecided: "Customer",
  PurchaseOrderSent: "Supplier",
  StaffAlert: "Staff",
  TaxInvoice: "Customer",
  // Whoever an admin chose to forward it to. Treated as staff for the leak
  // checks, because it is written by us and addressed by hand rather than
  // generated for one side.
  Forwarded: "Staff",

  // Opening a trade account. All three go to somebody who is not a customer
  // yet, but "Customer" is the right leak test for them — an applicant must
  // never learn a supplier's name either, and this is the audience that
  // check enforces.
  EmailVerification: "Customer",
  ApplicationReceived: "Customer",
  ApplicationDecided: "Customer",
  OrderProgress: "Customer",
};

export type EmailMessage = {
  kind: EmailKind;
  to: string;
  subject: string;
  /** The body. Plain text only — see the note on HTML at the bottom. */
  text: string;
};

/* ------------------------------------------------------------------ *
 * Addresses
 * ------------------------------------------------------------------ */

export const FROM_ADDRESS = "info@aussiemed.com";

/**
 * Deliberately permissive, and deliberately not a regex claiming to implement
 * RFC 5322. It rejects what is obviously not an address — no @, no domain, a
 * space in the middle, a trailing dot — and lets the mail server be the judge
 * of the rest. The cost of a false reject here is a customer who cannot be
 * told their order was received.
 */
export function isSendableAddress(value: string | null | undefined): boolean {
  const address = (value ?? "").trim();
  if (address.length < 6 || address.length > 254) return false;
  if (/\s/.test(address)) return false;

  const at = address.lastIndexOf("@");
  if (at < 1 || at === address.length - 1) return false;

  const domain = address.slice(at + 1);
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  if (domain.includes("..")) return false;

  return true;
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

/**
 * AED with two decimals and grouped thousands.
 *
 * A local copy rather than an import, because this module stays free of
 * runtime imports so it can be tested on its own. A test asserts it agrees
 * with money.ts on a range of values, which is what stops the two drifting.
 */
export function aed(fils: number): string {
  const safe = Number.isFinite(fils) ? fils / 100 : 0;
  const body = Math.abs(safe).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${safe < 0 ? "-" : ""}AED ${body}`;
}

/**
 * The date as the reader's own day.
 *
 * Timestamps are stored UTC. A clinic in Dubai reading "23:30 on the 15th"
 * about something that happened at 03:30 on the 16th their time has been told
 * the wrong day, which matters on anything with a cutoff in it.
 */
export function dubaiDate(when: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(when);
}

export function dubaiDateTime(when: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(when);
}

const rule = "".padEnd(56, "-");

/**
 * The currency note appears only where there is money on the page. A purchase
 * order carries quantities and no prices — telling that supplier how our
 * prices are shown is at best noise and at worst an invitation to ask.
 */
function signOff({ money = true }: { money?: boolean } = {}): string {
  return [
    "",
    rule,
    "AussieMed",
    FROM_ADDRESS,
    money ? "All prices in AED. VAT is shown separately on every document." : null,
  ]
    .filter((part) => part !== null)
    .join("\n");
}

/* ------------------------------------------------------------------ *
 * Customer: an order was received
 * ------------------------------------------------------------------ */

export type OrderLineForEmail = {
  name: string;
  skuCode: string;
  unitLabel: string;
  qty: number;
  lineTotalFils: number;
};

export type OrderConfirmationInput = {
  to: string;
  contactName: string;
  reference: string;
  placedAt: Date;
  lines: OrderLineForEmail[];
  subtotalFils: number;
  vatFils: number;
  totalFils: number;
  poReference?: string | null;
  placedByName?: string | null;
  branchLabel?: string | null;
};

export function orderConfirmation(input: OrderConfirmationInput): EmailMessage {
  const lines = input.lines.map(
    (line) =>
      `  ${line.qty} x ${line.name}\n` +
      `      ${line.skuCode} · ${line.unitLabel} · ${aed(line.lineTotalFils)}`
  );

  const body = [
    `Hello ${input.contactName || "there"},`,
    "",
    "Thank you — we have your order.",
    "",
    `Reference number: ${input.reference}`,
    `Placed: ${dubaiDateTime(input.placedAt)}`,
    input.poReference ? `Your PO: ${input.poReference}` : null,
    input.branchLabel ? `Delivering to: ${input.branchLabel}` : null,
    input.placedByName ? `Ordered by: ${input.placedByName}` : null,
    "",
    rule,
    ...lines,
    rule,
    `  Subtotal        ${aed(input.subtotalFils)}`,
    `  VAT             ${aed(input.vatFils)}`,
    `  Total           ${aed(input.totalFils)}`,
    "",
    "We will be in touch as your order moves. You can follow it at any time",
    "under Orders in your account.",
    signOff(),
  ]
    .filter((part) => part !== null)
    .join("\n");

  return {
    kind: "OrderConfirmation",
    to: input.to,
    // The reference in the subject: it is what someone searches their inbox
    // for months later, and what they quote on the phone.
    subject: `Your AussieMed order ${input.reference}`,
    text: body,
  };
}

/* ------------------------------------------------------------------ *
 * Customer: something they were waiting for is back
 * ------------------------------------------------------------------ */

export type RestockAlertInput = {
  to: string;
  productName: string;
  skuCode: string;
  unitLabel: string;
  priceFils: number;
  productUrl: string;
};

export function restockAlert(input: RestockAlertInput): EmailMessage {
  const body = [
    "Hello,",
    "",
    `${input.productName} is back in stock.`,
    "",
    `  ${input.skuCode} · ${input.unitLabel}`,
    `  ${aed(input.priceFils)} excluding VAT`,
    "",
    input.productUrl,
    "",
    "You asked us to let you know, so this is the one email you get about it.",
    "There is nothing to unsubscribe from.",
    signOff(),
  ].join("\n");

  return {
    kind: "RestockAlert",
    to: input.to,
    subject: `Back in stock: ${input.productName}`,
    text: body,
  };
}

/* ------------------------------------------------------------------ *
 * Customer: a decision on something they asked for
 * ------------------------------------------------------------------ */

export type AccountChangeDecidedInput = {
  to: string;
  contactName: string;
  organisationName: string;
  summary: string;
  approved: boolean;
  decidedAt: Date;
  decisionNote?: string | null;
  theirReason: string;
};

export function accountChangeDecided(
  input: AccountChangeDecidedInput
): EmailMessage {
  const verdict = input.approved ? "approved" : "not approved";

  const body = [
    `Hello ${input.contactName || "there"},`,
    "",
    `A change you asked for on ${input.organisationName} has been ${verdict}.`,
    "",
    `  ${input.summary}`,
    `  You told us: ${input.theirReason}`,
    `  Decided: ${dubaiDateTime(input.decidedAt)}`,
    input.decisionNote ? `  Our note: ${input.decisionNote}` : null,
    "",
    input.approved
      ? "It is live on your account now."
      : "Nothing on your account has changed. Reply to this email if you would like us to look again.",
    "",
    "Every change to your account, and the reason for it, is listed under",
    "Account changes when you sign in.",
    signOff(),
  ]
    .filter((part) => part !== null)
    .join("\n");

  return {
    kind: "AccountChangeDecided",
    to: input.to,
    subject: `${input.summary} — ${verdict}`,
    text: body,
  };
}

/* ------------------------------------------------------------------ *
 * Supplier: a purchase order
 * ------------------------------------------------------------------ */

export type PurchaseLineForEmail = {
  /** Their code leads; ours is the reference. */
  supplierPartNumber: string | null;
  skuCode: string;
  name: string;
  qtyOrdered: number;
};

export type PurchaseOrderSentInput = {
  to: string;
  supplierName: string;
  poNumber: string;
  sentAt: Date;
  expectedAt?: Date | null;
  lines: PurchaseLineForEmail[];
  portalUrl: string;
};

/**
 * The one email that crosses to the supplier side.
 *
 * It carries quantities and item codes and nothing else. No customer name, no
 * customer count, no delivery address, no order reference — under DEC-24 the
 * supplier never learns a customer exists, and pooling the day's demand into
 * one order is precisely what makes that possible. Tested, not assumed.
 */
export function purchaseOrderSent(input: PurchaseOrderSentInput): EmailMessage {
  const lines = input.lines.map(
    (line) =>
      `  ${String(line.qtyOrdered).padStart(5)} x ${line.supplierPartNumber ?? line.skuCode}\n` +
      `          ${line.name}\n` +
      `          our ref ${line.skuCode}`
  );

  const body = [
    `Dear ${input.supplierName},`,
    "",
    `Please supply the following against purchase order ${input.poNumber}.`,
    "",
    `Raised: ${dubaiDate(input.sentAt)}`,
    input.expectedAt ? `Required by: ${dubaiDate(input.expectedAt)}` : null,
    "",
    rule,
    ...lines,
    rule,
    `${input.lines.length} line${input.lines.length === 1 ? "" : "s"}.`,
    "",
    "Please acknowledge, and tell us anything you cannot supply, here:",
    input.portalUrl,
    "",
    "Quote the purchase order number on your delivery note and invoice.",
    signOff({ money: false }),
  ]
    .filter((part) => part !== null)
    .join("\n");

  return {
    kind: "PurchaseOrderSent",
    to: input.to,
    subject: `Purchase order ${input.poNumber} from AussieMed`,
    text: body,
  };
}

/* ------------------------------------------------------------------ *
 * Staff: something is waiting
 * ------------------------------------------------------------------ */

export type StaffAlertInput = {
  to: string;
  headline: string;
  detail: string;
  url: string;
};

/**
 * Internal only, and the reason the "no automated emails" rule does not bite:
 * this is not outreach to a customer, it is a queue telling a human it has
 * something in it. It never decides anything and never contacts anyone
 * outside AussieMed.
 */
export function staffAlert(input: StaffAlertInput): EmailMessage {
  const body = [
    input.headline,
    "",
    input.detail,
    "",
    input.url,
    signOff({ money: false }),
  ].join("\n");

  return {
    kind: "StaffAlert",
    to: input.to,
    subject: `AussieMed: ${input.headline}`,
    text: body,
  };
}

/* ------------------------------------------------------------------ *
 * A note on HTML
 * ------------------------------------------------------------------ *
 *
 * There isn't any, on purpose. A plain-text order confirmation arrives in
 * every client, cannot break in Outlook, cannot be held for images, and cannot
 * leak a tracking pixel. When the real templates are designed (a client
 * decision, not a code one) an html field joins EmailMessage and the drivers
 * pass it through; nothing else here changes.
 */

/* ------------------------------------------------------------------ *
 * Customer: the tax invoice, as an email
 * ------------------------------------------------------------------ */

export type InvoiceLineForEmail = {
  name: string;
  skuCode: string;
  qty: number;
  unitPriceFils: number;
  vatFils: number;
  lineTotalFils: number;
  zeroRated: boolean;
};

export type TaxInvoiceInput = {
  to: string;
  contactName: string;
  organisationName: string;
  reference: string;
  placedAt: Date;
  lines: InvoiceLineForEmail[];
  standardNetFils: number;
  zeroRatedNetFils: number;
  vatFils: number;
  totalFils: number;
  vatRatePercent: number;
  poReference?: string | null;
  /** Ours. Null until AC-03 is settled. */
  sellerTrn?: string | null;
  /** Theirs. Null when we never captured it. */
  buyerTrn?: string | null;
  /** Where the printable version lives. */
  documentUrl: string;
};

/**
 * The invoice a customer can read in their inbox.
 *
 * Two bases are subtotalled separately, as on the printed document: on a UAE
 * tax invoice the split between standard-rated and zero-rated supply is the
 * part an auditor reads, and one combined VAT figure hides it.
 *
 * When a TRN is missing the email says so rather than looking compliant. A
 * document that presents itself as a tax invoice and is not one is worse than
 * one that admits the gap — the customer may file it and find out at audit.
 * See AC-03.
 */
export function taxInvoice(input: TaxInvoiceInput): EmailMessage {
  const lines = input.lines.map(
    (line) =>
      `  ${line.qty} x ${line.name}\n` +
      `      ${line.skuCode} · ${aed(line.unitPriceFils)} each · ` +
      `VAT ${aed(line.vatFils)}${line.zeroRated ? " (zero rated)" : ""} · ` +
      `${aed(line.lineTotalFils)}`
  );

  const compliant = Boolean(input.sellerTrn && input.buyerTrn);

  const body = [
    `Hello ${input.contactName || "there"},`,
    "",
    `Your invoice for order ${input.reference}.`,
    "",
    `Reference number: ${input.reference}`,
    `Placed: ${dubaiDate(input.placedAt)}`,
    `Account: ${input.organisationName}`,
    input.poReference ? `Your PO: ${input.poReference}` : null,
    `Our TRN: ${input.sellerTrn ?? "not yet issued"}`,
    `Your TRN: ${input.buyerTrn ?? "not on file"}`,
    "",
    rule,
    ...lines,
    rule,
    // Padded to a fixed column so the figures line up in a monospaced client.
    // The VAT label carries a rate, so its width varies and it cannot be a
    // hand-counted run of spaces like the others.
    ...[
      ["Standard rated", input.standardNetFils],
      ["Zero rated", input.zeroRatedNetFils],
      [`VAT at ${input.vatRatePercent}%`, input.vatFils],
      ["Total", input.totalFils],
    ].map(([label, amount]) => `  ${String(label).padEnd(20)}${aed(Number(amount))}`),
    "",
    compliant
      ? null
      : "Please note: this is a record of what you were charged, not a compliant\n" +
        "UAE tax invoice — we do not yet hold both TRNs. A compliant document\n" +
        "will follow once that is in place.",
    compliant ? null : "",
    "The printable version is here:",
    input.documentUrl,
    signOff(),
  ]
    .filter((part) => part !== null)
    .join("\n");

  return {
    kind: "TaxInvoice",
    to: input.to,
    subject: `AussieMed invoice ${input.reference}`,
    text: body,
  };
}

/* ------------------------------------------------------------------ *
 * Forwarding something from the inbox
 * ------------------------------------------------------------------ */

export type ForwardInput = {
  to: string;
  subject: string;
  body: string;
  /** Added by the person sending it, above the original. */
  note?: string | null;
  /** Where the thing lives, if it has a page. */
  link?: string | null;
};

/**
 * An inbox item sent on to somebody, as written.
 *
 * The original wording is passed through unchanged rather than regenerated,
 * because the person forwarding it has read that text and is vouching for it.
 * Rewriting it into something else would mean they sent one thing and the
 * recipient received another.
 */
export function forwarded(input: ForwardInput): EmailMessage {
  const body = [
    input.note?.trim() ? input.note.trim() : null,
    input.note?.trim() ? "" : null,
    input.note?.trim() ? rule : null,
    input.body,
    input.link ? "" : null,
    input.link ? input.link : null,
    signOff({ money: false }),
  ]
    .filter((part) => part !== null)
    .join("\n");

  return {
    kind: "Forwarded",
    to: input.to,
    subject: input.subject,
    text: body,
  };
}


/* ------------------------------------------------------------------ *
 * Opening a trade account
 * ------------------------------------------------------------------ */

export type EmailVerificationInput = {
  to: string;
  contactName: string;
  code: string;
  minutes: number;
};

/**
 * The code that proves an address reaches somebody.
 *
 * The code is on its own line and nothing else on that line, because people
 * copy it with a double-click, and a line reading "Your code is 123456."
 * copies the full stop with it.
 */
export function emailVerification(input: EmailVerificationInput): EmailMessage {
  const body = [
    `Hello ${input.contactName || "there"},`,
    "",
    "Confirming your email address is the first step in opening a trade",
    "account with AussieMed. Your code is:",
    "",
    `  ${input.code}`,
    "",
    `It stops working in ${input.minutes} minutes. If you did not ask for it,`,
    "you can ignore this — nothing has been created in your name.",
    "",
    "Once your address is confirmed, an account manager reviews the",
    "application. We will email you either way.",
    signOff(),
  ].join("\n");

  return {
    kind: "EmailVerification",
    to: input.to,
    subject: `${input.code} is your AussieMed confirmation code`,
    text: body,
  };
}

export type ApplicationReceivedInput = {
  to: string;
  contactName: string;
  companyName: string;
};

/**
 * Sent the moment the address is confirmed, so nobody is left wondering
 * whether the form worked. Says plainly that nothing can be ordered yet — a
 * customer who thinks they have an account and finds they cannot sign in has
 * been misled by us, not by their own misreading.
 */
export function applicationReceived(
  input: ApplicationReceivedInput
): EmailMessage {
  const body = [
    `Hello ${input.contactName || "there"},`,
    "",
    `Thank you — your email address is confirmed and your application for a`,
    `trade account for ${input.companyName} is with our team.`,
    "",
    "You cannot place orders yet. Trade accounts are opened by a person",
    "rather than automatically, and we will email you as soon as yours is",
    "approved — usually within one working day.",
    "",
    "If anything on the application needs correcting, reply to this email",
    "and we will sort it out before it goes to review.",
    signOff(),
  ].join("\n");

  return {
    kind: "ApplicationReceived",
    to: input.to,
    subject: "We have your AussieMed trade account application",
    text: body,
  };
}

export type ApplicationDecidedInput = {
  to: string;
  contactName: string;
  companyName: string;
  approved: boolean;
  /** Told to the applicant on a refusal. */
  reason?: string | null;
  signInUrl: string;
};

export function applicationDecided(
  input: ApplicationDecidedInput
): EmailMessage {
  const body = input.approved
    ? [
        `Hello ${input.contactName || "there"},`,
        "",
        `Your AussieMed trade account for ${input.companyName} is open.`,
        "",
        "Sign in with the email address and password you chose:",
        "",
        `  ${input.signInUrl}`,
        "",
        "Your first order can go in straight away. Anything placed before 5pm",
        "joins the same day's buying run.",
        signOff(),
      ].join("\n")
    : [
        `Hello ${input.contactName || "there"},`,
        "",
        `We are not able to open a trade account for ${input.companyName} at`,
        "the moment.",
        "",
        // A refusal with no reason is an email nobody can act on, and it
        // produces a phone call rather than a corrected application.
        ...(input.reason?.trim() ? [input.reason.trim(), ""] : []),
        "If you think this is a mistake, or something has changed, reply to",
        "this email and we will look again.",
        signOff(),
      ].join("\n");

  return {
    kind: "ApplicationDecided",
    to: input.to,
    subject: input.approved
      ? "Your AussieMed trade account is open"
      : "About your AussieMed trade account application",
    text: body,
  };
}

/* ------------------------------------------------------------------ *
 * Customer: the order moved
 * ------------------------------------------------------------------ */

export type OrderProgressInput = {
  to: string;
  contactName: string;
  reference: string;
  /** Pending | Processing | Dispatched | Delivered | Cancelled. */
  status: string;
  orderUrl: string;
  courier?: string | null;
  trackingNumber?: string | null;
  expectedOn?: string | null;
  /** Lines still to come, one per line, already indented. */
  itemsOutstanding?: string | null;
};

/**
 * One email per step of an order.
 *
 * Written to be worth receiving rather than merely triggered. Each says what
 * has changed, what happens next, and nothing else — a buyer who gets four
 * emails about one order will read the fourth only if the first three earned
 * it. "Your order status has been updated to Processing" is not worth an inbox
 * slot; "we are making it up now, it leaves us tomorrow" is.
 *
 * The stage words are the customer's, from order-progress.ts, not the
 * warehouse's. Nobody outside this building knows what Processing means.
 */
export function orderProgressed(input: OrderProgressInput): EmailMessage {
  const hello = `Hello ${input.contactName || "there"},`;
  const tail = [
    "",
    "Everything about this order, including the invoice:",
    `  ${input.orderUrl}`,
    signOff(),
  ];

  const body = (lines: (string | null | undefined)[]) =>
    [hello, "", ...lines.filter((l): l is string => typeof l === "string"), ...tail]
      .join("\n")
      // Never more than one blank line, whatever combination of optional
      // clauses a particular order happens to have. Balancing the spacing by
      // hand per branch is how a template ends up with a double gap in the one
      // case nobody tested.
      .replace(/\n{3,}/g, "\n\n");

  switch (input.status) {
    case "Processing":
      return {
        kind: "OrderProgress",
        to: input.to,
        subject: `${input.reference} is being made up`,
        text: body([
          `Your order ${input.reference} has gone into today's buying run and is`,
          "being made up at our sorting facility.",
          input.expectedOn ? "" : null,
          input.expectedOn ? `We expect it to leave us on ${input.expectedOn}.` : null,
        ]),
      };

    case "Dispatched":
      return {
        kind: "OrderProgress",
        to: input.to,
        subject: `${input.reference} is on its way`,
        text: body([
          `Your order ${input.reference} has left us.`,
          "",
          input.courier ? `Courier: ${input.courier}` : null,
          input.trackingNumber ? `Tracking: ${input.trackingNumber}` : null,
          // Said plainly rather than left to be discovered on the doorstep.
          input.itemsOutstanding ? "" : null,
          input.itemsOutstanding ? "Still to follow:" : null,
          input.itemsOutstanding,
          input.itemsOutstanding
            ? "These are being sourced and will come separately, at no extra"
            : null,
          input.itemsOutstanding ? "delivery cost to you." : null,
        ]),
      };

    case "Delivered":
      return {
        kind: "OrderProgress",
        to: input.to,
        subject: `${input.reference} has been delivered`,
        text: body([
          `Your order ${input.reference} has been delivered.`,
          "",
          "If anything is missing, damaged or not what you expected, reply to",
          "this email within seven days and we will put it right.",
        ]),
      };

    case "Cancelled":
      return {
        kind: "OrderProgress",
        to: input.to,
        subject: `${input.reference} has been cancelled`,
        text: body([
          `Your order ${input.reference} has been cancelled and nothing will be`,
          "delivered against it.",
          "",
          // A cancellation nobody explained is a phone call, so the door is
          // opened rather than left for them to find.
          "If that is not what you expected, reply to this email and we will",
          "look into it.",
        ]),
      };

    default:
      // Pending is the state an order is created in, and checkout already sends
      // a confirmation. A second email saying the same thing seconds later
      // teaches people that ours are not worth opening.
      return {
        kind: "OrderProgress",
        to: input.to,
        subject: `${input.reference} — update`,
        text: body([`Your order ${input.reference} has been updated.`]),
      };
  }
}
