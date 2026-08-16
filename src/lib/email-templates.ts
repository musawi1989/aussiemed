/**
 * Ready-made wording for the things that happen to an order.
 *
 * Pure: no database, no imports. Each template turns a small context into a
 * subject and a body, which an admin then edits before sending — so this is a
 * starting point, not a machine talking to a customer. That distinction is the
 * platform's standing rule about automated contact, and it is why nothing here
 * sends anything.
 *
 * Every template declares who it is for, and that is load-bearing rather than
 * organisational. Under DEC-24 a supplier never learns that a customer exists,
 * so a supplier template has no customer context to fill in with — the leak is
 * prevented by the shape of the data these are given, not by remembering.
 */

export type TemplateAudience = "Customer" | "Supplier";

export type OrderContext = {
  reference: string;
  contactName?: string | null;
  organisationName?: string | null;
  placedOn?: string | null;
  /** "3 of 7 lines", "the gloves" — whatever the admin is writing about. */
  items?: string | null;
  expectedOn?: string | null;
  courier?: string | null;
  trackingNumber?: string | null;
  totalLabel?: string | null;
  dueOn?: string | null;
};

export type SupplierContext = {
  supplierName?: string | null;
  poNumber: string;
  raisedOn?: string | null;
  items?: string | null;
  expectedOn?: string | null;
};

export type Draft = { subject: string; body: string };

export type EmailTemplate =
  | {
      id: string;
      label: string;
      audience: "Customer";
      /** Prompts the admin for an order before the wording makes sense. */
      needsOrder: boolean;
      render: (context: OrderContext) => Draft;
    }
  | {
      id: string;
      label: string;
      audience: "Supplier";
      needsOrder: boolean;
      render: (context: SupplierContext) => Draft;
    };

const sign = (lines: string[]) =>
  [...lines, "", "Thank you,", "AussieMed", "info@aussiemed.com"].join("\n");

/** "there" rather than a blank, so a greeting never reads as a mail-merge fault. */
const who = (name?: string | null) => (name?.trim() ? name.trim() : "there");

/** Only prints the sentence when there is something to say. */
const maybe = (line: string | null): string[] => (line ? [line] : []);

/* ------------------------------------------------------------------ *
 * To a customer
 * ------------------------------------------------------------------ */

const CUSTOMER_TEMPLATES: Extract<EmailTemplate, { audience: "Customer" }>[] = [
  {
    id: "order-received",
    label: "We have your order",
    audience: "Customer",
    needsOrder: true,
    render: (c) => ({
      subject: `Your AussieMed order ${c.reference}`,
      body: sign([
        `Hello ${who(c.contactName)},`,
        "",
        `Thank you — we have your order ${c.reference} and it is being prepared.`,
        ...maybe(c.placedOn ? `Placed: ${c.placedOn}` : null),
        ...maybe(c.totalLabel ? `Total: ${c.totalLabel}` : null),
        "",
        "We will be in touch as it moves.",
      ]),
    }),
  },
  {
    id: "order-delayed",
    label: "The order is running late",
    audience: "Customer",
    needsOrder: true,
    render: (c) => ({
      subject: `An update on your order ${c.reference}`,
      body: sign([
        `Hello ${who(c.contactName)},`,
        "",
        `I am sorry — order ${c.reference} is going to take longer than we said.`,
        ...maybe(c.items ? `The delay is on ${c.items}.` : null),
        ...maybe(
          c.expectedOn
            ? `We now expect it with you by ${c.expectedOn}.`
            : "I will confirm a new date as soon as I have one from our supplier."
        ),
        "",
        // Said plainly rather than buried: a clinic that cannot wait needs to
        // know it can stop waiting.
        "If that is too late for you, reply and we will cancel the line or find",
        "you an alternative.",
      ]),
    }),
  },
  {
    id: "part-shipped",
    label: "Part of the order has shipped",
    audience: "Customer",
    needsOrder: true,
    render: (c) => ({
      subject: `Part of order ${c.reference} is on its way`,
      body: sign([
        `Hello ${who(c.contactName)},`,
        "",
        `Some of order ${c.reference} has left us and the rest is following.`,
        ...maybe(c.items ? `On its way: ${c.items}.` : null),
        ...maybe(c.courier ? `Courier: ${c.courier}` : null),
        ...maybe(c.trackingNumber ? `Tracking: ${c.trackingNumber}` : null),
        "",
        "You are not charged twice for a split delivery.",
      ]),
    }),
  },
  {
    id: "dispatched",
    label: "The order is on its way",
    audience: "Customer",
    needsOrder: true,
    render: (c) => ({
      subject: `Order ${c.reference} is on its way`,
      body: sign([
        `Hello ${who(c.contactName)},`,
        "",
        `Order ${c.reference} has left us.`,
        ...maybe(c.courier ? `Courier: ${c.courier}` : null),
        ...maybe(c.trackingNumber ? `Tracking: ${c.trackingNumber}` : null),
        ...maybe(c.expectedOn ? `Expected with you: ${c.expectedOn}` : null),
        "",
        "Please check the delivery against the note before signing for it.",
      ]),
    }),
  },
  {
    id: "item-unavailable",
    label: "An item cannot be supplied",
    audience: "Customer",
    needsOrder: true,
    render: (c) => ({
      subject: `An item on order ${c.reference}`,
      body: sign([
        `Hello ${who(c.contactName)},`,
        "",
        `One item on order ${c.reference} cannot be supplied at the moment.`,
        ...maybe(c.items ? `The item is ${c.items}.` : null),
        "",
        "We can send an equivalent, hold the line until stock returns, or take it",
        "off the order — whichever suits you. Nothing has been charged for it.",
      ]),
    }),
  },
  {
    id: "ready-for-collection",
    label: "Ready to collect",
    audience: "Customer",
    needsOrder: true,
    render: (c) => ({
      subject: `Order ${c.reference} is ready to collect`,
      body: sign([
        `Hello ${who(c.contactName)},`,
        "",
        `Order ${c.reference} is packed and ready whenever you are.`,
        "",
        "Please bring the reference number with you.",
      ]),
    }),
  },
  {
    id: "payment-due",
    label: "A payment is coming due",
    audience: "Customer",
    needsOrder: true,
    render: (c) => ({
      subject: `Invoice ${c.reference}`,
      body: sign([
        `Hello ${who(c.contactName)},`,
        "",
        `A reminder that invoice ${c.reference} falls due shortly.`,
        ...maybe(c.totalLabel ? `Amount: ${c.totalLabel}` : null),
        ...maybe(c.dueOn ? `Due: ${c.dueOn}` : null),
        "",
        "If it has already been paid, please ignore this.",
      ]),
    }),
  },
  {
    id: "payment-overdue",
    label: "A payment is overdue",
    audience: "Customer",
    needsOrder: true,
    render: (c) => ({
      subject: `Overdue: invoice ${c.reference}`,
      body: sign([
        `Hello ${who(c.contactName)},`,
        "",
        `Invoice ${c.reference} is past its due date.`,
        ...maybe(c.totalLabel ? `Amount: ${c.totalLabel}` : null),
        ...maybe(c.dueOn ? `Was due: ${c.dueOn}` : null),
        "",
        // Firm without being a threat: these are accounts we want to keep.
        "If there is a query on it, tell me and I will sort it out. Otherwise",
        "please let me know when it will be settled.",
      ]),
    }),
  },
  {
    id: "general",
    label: "A message about the order",
    audience: "Customer",
    needsOrder: false,
    render: (c) => ({
      subject: c.reference ? `About your order ${c.reference}` : "A message from AussieMed",
      body: sign([`Hello ${who(c.contactName)},`, "", ""]),
    }),
  },
];

/* ------------------------------------------------------------------ *
 * To a supplier
 * ------------------------------------------------------------------ */

const SUPPLIER_TEMPLATES: Extract<EmailTemplate, { audience: "Supplier" }>[] = [
  {
    id: "chase-acknowledgement",
    label: "Chase an acknowledgement",
    audience: "Supplier",
    needsOrder: true,
    render: (s) => ({
      subject: `Purchase order ${s.poNumber} — please confirm`,
      body: sign([
        `Dear ${who(s.supplierName)},`,
        "",
        `We have not yet had confirmation of purchase order ${s.poNumber}.`,
        ...maybe(s.raisedOn ? `It was raised on ${s.raisedOn}.` : null),
        "",
        "Please confirm what you can supply, and tell us about anything you",
        "cannot, so we can arrange it elsewhere.",
      ]),
    }),
  },
  {
    id: "chase-delivery",
    label: "Chase a delivery",
    audience: "Supplier",
    needsOrder: true,
    render: (s) => ({
      subject: `Purchase order ${s.poNumber} — delivery`,
      body: sign([
        `Dear ${who(s.supplierName)},`,
        "",
        `Could you tell us where purchase order ${s.poNumber} has got to?`,
        ...maybe(s.expectedOn ? `It was expected by ${s.expectedOn}.` : null),
        ...maybe(s.items ? `Outstanding: ${s.items}.` : null),
        "",
        "A despatch date and a tracking number would be helpful.",
      ]),
    }),
  },
  {
    id: "short-delivery",
    label: "Query a short delivery",
    audience: "Supplier",
    needsOrder: true,
    render: (s) => ({
      subject: `Purchase order ${s.poNumber} — short delivery`,
      body: sign([
        `Dear ${who(s.supplierName)},`,
        "",
        `The delivery against purchase order ${s.poNumber} was short.`,
        ...maybe(s.items ? `Missing: ${s.items}.` : null),
        "",
        "Please confirm whether the balance is following, and when, or credit it.",
      ]),
    }),
  },
  {
    id: "price-query",
    label: "Query a price",
    audience: "Supplier",
    needsOrder: true,
    render: (s) => ({
      subject: `Purchase order ${s.poNumber} — pricing`,
      body: sign([
        `Dear ${who(s.supplierName)},`,
        "",
        `A query on the pricing against purchase order ${s.poNumber}.`,
        ...maybe(s.items ? `The line in question: ${s.items}.` : null),
        "",
        "Could you confirm the agreed price so we can settle the invoice?",
      ]),
    }),
  },
  {
    id: "supplier-general",
    label: "A message about the purchase order",
    audience: "Supplier",
    needsOrder: false,
    render: (s) => ({
      subject: s.poNumber
        ? `Purchase order ${s.poNumber}`
        : "A message from AussieMed",
      body: sign([`Dear ${who(s.supplierName)},`, "", ""]),
    }),
  },
];

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  ...CUSTOMER_TEMPLATES,
  ...SUPPLIER_TEMPLATES,
];

export function templatesFor(audience: TemplateAudience): EmailTemplate[] {
  return EMAIL_TEMPLATES.filter((t) => t.audience === audience);
}

export function findTemplate(id: string): EmailTemplate | null {
  return EMAIL_TEMPLATES.find((t) => t.id === id) ?? null;
}

/* ------------------------------------------------------------------ *
 * The guard
 * ------------------------------------------------------------------ */

/**
 * Refuses to let a customer's details travel to a supplier.
 *
 * An admin writes freely in the box, so nothing can stop them typing a clinic
 * name into a message bound for Livingstone — but the send path can notice and
 * stop. DEC-24 is not a preference, and the cost of catching a genuine mistake
 * here is one edit, while the cost of missing it is a commercial relationship.
 *
 * Whole words only, so a supplier called "Dubai Medical" is not blocked by a
 * customer in Dubai.
 */
export function findCustomerLeaks(body: string, identifiers: string[]): string[] {
  const found = new Set<string>();

  for (const raw of identifiers) {
    const value = (raw ?? "").trim();
    // Two characters or fewer matches everything and means nothing.
    if (value.length < 3) continue;

    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^\\w-])${escaped}([^\\w-]|$)`, "i").test(body)) {
      found.add(value);
    }
  }

  return [...found];
}
