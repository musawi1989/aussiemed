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
  "QuoteReply",
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

  // Written by a person in the back office and addressed to the one buyer
  // who asked. It is a customer email, not a "Forwarded" one, because the
  // customer leak test is the one that matters here: a quote is answered
  // out of a supplier price list, and the name of the supplier it came from
  // is exactly the thing that must not travel with the number.
  QuoteReply: "Customer",
};

/** What a message was built from, for an admin override to render from. */
export type MessageContext = Record<string, string | number | null>;

export type EmailMessage = {
  html?: string;
  attachments?: { fileName: string; contentType: string; bytes: Uint8Array }[];
  kind: EmailKind;
  to: string;
  subject: string;
  /** The body. Plain text only — see the note on HTML at the bottom. */
  text: string;
  /**
   * The values this wording was built from, so an admin can write their own
   * version of it against the same data — see MessageTemplate.
   *
   * ABSENT MEANS NOT OVERRIDABLE. A message that does not publish its context
   * cannot be re-rendered from a template, and the send path falls back to the
   * built-in text rather than to a body full of unresolved placeholders. That
   * is the safe direction: the tested wording goes out.
   *
   * Only what a person would put in a sentence goes in here. Anything already
   * formatted for the reader — an amount as AED, a date as their day — is
   * placed as the formatted string, because a template author writing
   * {{total}} means the words "AED 1,234.00" and not a count of fils.
   */
  context?: MessageContext;
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
    context: {
      contactName: input.contactName,
      reference: input.reference,
      placedAt: dubaiDateTime(input.placedAt),
      // Already formatted: a template author writing {{total}} means the words
      // "AED 1,234.00", not a count of fils.
      subtotal: aed(input.subtotalFils),
      vat: aed(input.vatFils),
      total: aed(input.totalFils),
      lineCount: input.lines.length,
      items: lines.join("\n"),
      poReference: input.poReference ?? null,
      placedByName: input.placedByName ?? null,
      branchLabel: input.branchLabel ?? null,
    },
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
    context: {
      productName: input.productName,
      skuCode: input.skuCode,
      unitLabel: input.unitLabel,
      price: aed(input.priceFils),
      productUrl: input.productUrl,
    },
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
    context: {
      contactName: input.contactName,
      organisationName: input.organisationName,
      summary: input.summary,
      verdict,
      decidedAt: dubaiDateTime(input.decidedAt),
      decisionNote: input.decisionNote ?? null,
      theirReason: input.theirReason,
    },
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
    // Nothing about a customer, here or anywhere near here. The context is
    // what a template author can put in a sentence, so anything placed in it
    // can end up in the supplier's inbox — see DEC-24.
    context: {
      supplierName: input.supplierName,
      poNumber: input.poNumber,
      raisedOn: dubaiDate(input.sentAt),
      requiredBy: input.expectedAt ? dubaiDate(input.expectedAt) : null,
      lineCount: input.lines.length,
      items: lines.join("\n"),
      portalUrl: input.portalUrl,
    },
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
    context: {
      headline: input.headline,
      detail: input.detail,
      url: input.url,
    },
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
  /** "Agreed price" / "2.5% off list", or null when bought at list. */
  discountNote?: string | null;
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
  /**
   * What the account's terms took off, by where it came from, printed above
   * the totals. Empty when there was no discount: an invoice carrying
   * "Account discount 0.00" is noise, and one carrying nothing where the
   * customer expected their 2.5% is a support call.
   */
  discountRows?: { label: string; amountFils: number }[];
  listSubtotalFils?: number | null;
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
      `${aed(line.lineTotalFils)}${line.discountNote ? ` · ${line.discountNote}` : ""}`
  );

  const discountRows = input.discountRows ?? [];
  const compliant = Boolean(input.sellerTrn && input.buyerTrn);

  // Never narrower than the 20 columns the fixed labels have always used, so
  // an invoice with no discount rows reads exactly as it did before.
  const moneyColumn = Math.max(
    20,
    // Two spaces clear of the longest label, not one: a single space reads as
    // a typo next to rows sitting six columns out.
    ...discountRows.map((row) => row.label.length + 2)
  );

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
      // What it would have come to, then what came off, then the bases. A net
      // subtotal with no sign of the discount is a saving the customer was
      // given and never told about.
      ...(discountRows.length > 0 && input.listSubtotalFils
        ? ([["Subtotal at list", input.listSubtotalFils]] as [string, number][])
        : []),
      ...discountRows.map((row) => [row.label, -row.amountFils] as [string, number]),
      ["Standard rated", input.standardNetFils],
      ["Zero rated", input.zeroRatedNetFils],
      [`VAT at ${input.vatRatePercent}%`, input.vatFils],
      ["Total", input.totalFils],
    ].map(
      /*
       * Padded to the widest label rather than to a hard 20.
       *
       * It was 20, and "Account discount 2.5%" is 21, so the figure printed
       * flush against the label as "Account discount 2.5%-AED 0.40". The
       * labels used to be four fixed strings; they now include a rate the
       * account chooses, so their width is not something this file can know
       * in advance. Found by reading an invoice the real path produced.
       */
      ([label, amount]) =>
        `  ${String(label).padEnd(moneyColumn)}${aed(Number(amount))}`
    ),
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
    context: {
      contactName: input.contactName,
      organisationName: input.organisationName,
      reference: input.reference,
      placedOn: dubaiDate(input.placedAt),
      standardRated: aed(input.standardNetFils),
      zeroRated: aed(input.zeroRatedNetFils),
      vat: aed(input.vatFils),
      total: aed(input.totalFils),
      vatRatePercent: input.vatRatePercent,
      poReference: input.poReference ?? null,
      sellerTrn: input.sellerTrn ?? null,
      buyerTrn: input.buyerTrn ?? null,
      documentUrl: input.documentUrl,
      items: lines.join("\n"),
    },
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
    context: {
      contactName: input.contactName,
      code: input.code,
      minutes: input.minutes,
    },
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
    context: {
      contactName: input.contactName,
      companyName: input.companyName,
    },
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
    // One kind, two outcomes. A template author writing a single wording for
    // both has to be able to tell them apart, so the verdict is a value rather
    // than only a difference in the built-in text.
    context: {
      contactName: input.contactName,
      companyName: input.companyName,
      verdict: input.approved ? "approved" : "not approved",
      reason: input.reason?.trim() || null,
      signInUrl: input.signInUrl,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Customer: the answer to a quote request
 * ------------------------------------------------------------------ */

export type QuoteLineForEmail = {
  name: string;
  unitLabel: string;
  qty: number;
};

export type QuoteReplyInput = {
  to: string;
  contactName: string;
  reference: string;
  askedAt: Date;
  lines: QuoteLineForEmail[];
  /** What the buyer wrote on the form, if they wrote anything. */
  theirNotes?: string | null;
  /** The reply, in the words the person in the back office typed. */
  reply: string;
};

/**
 * A price going back to somebody who asked for one.
 *
 * THE REPLY IS NOT REWRITTEN. Everything around it is ours — the greeting,
 * the reference, the list of what they asked about — but the answer itself
 * is reproduced exactly as it was typed, because the person who typed it is
 * the one who is accountable for the number in it. A template that helpfully
 * rephrased "AED 22.80 a box held for 90 days" would eventually rephrase it
 * into something nobody agreed to.
 *
 * The lines are echoed back for a reason a shorter email would miss: a clinic
 * that asked for prices on four things three weeks ago does not remember
 * which four, and an answer that opens with a number and no question is a
 * reply they have to go and find the other half of.
 *
 * Nothing here names a supplier. A quote is worked out from a supplier price
 * list and the temptation is to justify the figure with where it came from;
 * under DEC-24 the customer never learns a supplier exists, and the test on
 * this file holds that line for the same reason it holds it everywhere else.
 */
export function quoteReply(input: QuoteReplyInput): EmailMessage {
  const lines = input.lines.map(
    (line) => `  ${line.qty} x ${line.name}\n      ${line.unitLabel}`
  );

  const body = [
    `Hello ${input.contactName || "there"},`,
    "",
    `Thank you for your quote request on ${dubaiDate(input.askedAt)}. Our`,
    "answer is below.",
    "",
    `Quote reference: ${input.reference}`,
    "",
    "You asked about:",
    ...lines,
    input.theirNotes ? "" : null,
    input.theirNotes ? `You told us: ${input.theirNotes}` : null,
    "",
    rule,
    input.reply.trim(),
    rule,
    "",
    // An answer with no way back is a quote that dies in an inbox. Reply,
    // rather than a link to a form they would have to fill in again.
    "If you would like to go ahead, or if anything needs changing, reply to",
    "this email and it comes straight back to us.",
    signOff(),
  ]
    .filter((part) => part !== null)
    .join("\n");

  return {
    kind: "QuoteReply",
    to: input.to,
    // The reference in the subject: it is what they search their inbox for
    // when they come back to it, and what they quote on the phone.
    subject: `Your AussieMed quote ${input.reference}`,
    text: body,
    context: {
      contactName: input.contactName,
      reference: input.reference,
      askedOn: dubaiDate(input.askedAt),
      theirNotes: input.theirNotes ?? null,
      // The admin's own words. A template can move them but must not be able
      // to drop them: an answer with the answer taken out is worse than none.
      reply: input.reply.trim(),
      items: lines.join("\n"),
    },
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

  /**
   * Shared by all five branches, because they are one message with five
   * wordings rather than five messages. An override is written once and has to
   * make sense whichever step fired it, so every branch offers the same names.
   */
  const context = {
    contactName: input.contactName,
    reference: input.reference,
    status: input.status,
    orderUrl: input.orderUrl,
    courier: input.courier ?? null,
    trackingNumber: input.trackingNumber ?? null,
    expectedOn: input.expectedOn ?? null,
    itemsOutstanding: input.itemsOutstanding ?? null,
  };

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
        context,
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
        context,
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
        context,
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
        context,
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
        context,
        to: input.to,
        subject: `${input.reference} — update`,
        text: body([`Your order ${input.reference} has been updated.`]),
      };
  }
}
