import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";
import { fillPlaceholders } from "./email-templates";
import { fillEmailHtml, safeEmailHtml } from "./email-html";
import {
  AUDIENCE,
  EMAIL_KINDS,
  type EmailKind,
  type EmailMessage,
} from "./email-message";

/**
 * An admin's own wording for the emails AussieMed sends automatically.
 *
 * HOW IT WORKS. Every message still goes through its typed builder in
 * email-message.ts, which produces the tested wording AND the context it was
 * built from. If a template exists for that kind and is switched on, the send
 * path renders the admin's subject and body from that same context instead.
 * Nothing else about the message changes: the same address, the same kind, the
 * same record on /admin/emails.
 *
 * DELETING PUTS THE ORIGINAL BACK. That is deliberate and it is the only safety
 * net here — see the warning below. There is no "restore defaults" to get
 * wrong, because the default is simply the absence of a row.
 *
 * ⚠ NOTHING HERE IS VALIDATED, at the client's instruction — DEC-40. A saved
 * template is not checked for a supplier's name in a customer email, for
 * placeholders that do not exist, or for wording that no longer says what the
 * message is for. The screen reports unknown placeholders as a note and saves
 * anyway. The consequence is real and worth stating plainly: a mistake here
 * goes out under AussieMed's name on every order until somebody notices.
 *
 * A message whose builder publishes no context cannot be overridden at all.
 * That is not an oversight — without the values there is nothing to render
 * against, and the alternative is posting a body full of unresolved
 * placeholders to a customer.
 */

export type TemplateRow = {
  kind: EmailKind;
  label: string;
  audience: string;
  /** What the built-in produces, for a starting point and a comparison. */
  sample: { subject: string; body: string } | null;
  /** Placeholders this message can fill. */
  placeholders: string[];
  /** Null when nobody has written one. */
  template: {
    id: string;
    subject: string;
    body: string;
    html: string | null;
    isActive: boolean;
    updatedAt: Date;
    updatedByName: string;
  } | null;
  /** False where the builder publishes no context to render against. */
  overridable: boolean;
};

/** What each message is called on the screen, rather than its type name. */
export const KIND_LABELS: Record<EmailKind, string> = {
  OrderConfirmation: "Order received",
  OrderProgress: "Order has moved on",
  TaxInvoice: "Invoice",
  RestockAlert: "Back in stock",
  AccountChangeDecided: "Account change decided",
  QuoteReply: "Answer to a quote request",
  EmailVerification: "Confirm your email address",
  ApplicationReceived: "Trade application received",
  ApplicationDecided: "Trade application decided",
  PurchaseOrderSent: "Purchase order to a supplier",
  StaffAlert: "Alert to our own staff",
  Forwarded: "Written by hand from the back office",
};

/**
 * Which messages can be rewritten, and what they are built from.
 *
 * Derived by asking each builder for a sample rather than by keeping a second
 * list in step with the first. A builder that starts publishing a context
 * appears here on its own; one that stops, disappears. There is no register to
 * forget to update.
 */
async function sampleFor(kind: EmailKind): Promise<EmailMessage | null> {
  const { sampleMessage } = await import("./message-samples");
  return sampleMessage(kind);
}

export async function listTemplates(): Promise<TemplateRow[]> {
  await requireAdmin("email", "view");

  const saved = await db.messageTemplate.findMany();
  const byKind = new Map(saved.map((row) => [row.kind, row]));

  const rows: TemplateRow[] = [];
  for (const kind of EMAIL_KINDS) {
    const sample = await sampleFor(kind);
    const context = sample?.context ?? null;
    const row = byKind.get(kind);

    rows.push({
      kind,
      label: KIND_LABELS[kind],
      audience: AUDIENCE[kind],
      sample: sample ? { subject: sample.subject, body: sample.text } : null,
      placeholders: context ? Object.keys(context).sort() : [],
      overridable: Boolean(context),
      template: row
        ? {
            id: row.id,
            subject: row.subject,
            body: row.body,
            html: row.html,
            isActive: row.isActive,
            updatedAt: row.updatedAt,
            updatedByName: row.updatedByName,
          }
        : null,
    });
  }

  // Overridable first — the rest are on the screen so nobody wonders where a
  // message went, but they are not what somebody came here to do.
  return rows.sort(
    (a, b) =>
      Number(b.overridable) - Number(a.overridable) ||
      a.label.localeCompare(b.label)
  );
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

function isKind(value: string): value is EmailKind {
  return (EMAIL_KINDS as readonly string[]).includes(value);
}

export async function saveTemplate(input: {
  kind: string;
  subject: string;
  body: string;
  html?: string;
  isActive: boolean;
}): Promise<Result<{ kind: string }>> {
  const actor = await requireAdmin("email");

  if (!isKind(input.kind)) {
    return { ok: false, error: "That is not a message we send." };
  }

  const subject = input.subject.trim();
  const body = input.body.trim();
  const html = input.html?.trim() ? safeEmailHtml(input.html) : null;
  if ((input.html?.length ?? 0) > 100000 || body.length > 100000) return { ok: false, error: "Keep each message under 100,000 characters." };

  // The only two rules, and neither is about the wording: an email with no
  // subject and an email with no body are not messages, they are bugs.
  if (subject.length === 0) {
    return { ok: false, error: "Give it a subject — an empty one reads as spam." };
  }
  if (body.length === 0) {
    return { ok: false, error: "There is no message here to send." };
  }

  const before = await db.messageTemplate.findUnique({ where: { kind: input.kind } });

  await db.messageTemplate.upsert({
    where: { kind: input.kind },
    create: {
      kind: input.kind,
      subject,
      body,
      html,
      isActive: input.isActive,
      updatedByName: actor.name,
    },
    update: {
      subject,
      body,
      html,
      isActive: input.isActive,
      updatedByName: actor.name,
    },
  });

  await audit(
    actor,
    before ? "template.update" : "template.create",
    "MessageTemplate",
    input.kind,
    before
      ? { subject: before.subject, body: before.body, html: before.html, isActive: before.isActive }
      : null,
    { subject, body, html, isActive: input.isActive }
  );

  return { ok: true, value: { kind: input.kind } };
}

/** Deleting is how the built-in wording comes back. */
export async function deleteTemplate(kind: string): Promise<Result> {
  const actor = await requireAdmin("email");

  const row = await db.messageTemplate.findUnique({ where: { kind } });
  if (!row) return { ok: false, error: "There is no template to remove." };

  await db.messageTemplate.delete({ where: { kind } });
  await audit(
    actor,
    "template.delete",
    "MessageTemplate",
    kind,
    { subject: row.subject, body: row.body },
    null
  );

  return { ok: true, value: undefined };
}

/* ------------------------------------------------------------------ *
 * Applying, on the way out
 * ------------------------------------------------------------------ */

/**
 * Swaps in the admin's wording, if there is any.
 *
 * NEVER THROWS, AND FAILS TOWARDS THE BUILT-IN. Every path that cannot produce
 * an override — no row, switched off, no context to render against, a database
 * that did not answer — returns the message untouched. A customer getting the
 * tested wording is a non-event; a customer getting nothing because a template
 * lookup failed is an order confirmation that never arrived.
 */
export async function applyTemplate(message: EmailMessage): Promise<EmailMessage> {
  if (!message.context) return message;

  try {
    const row = await db.messageTemplate.findUnique({ where: { kind: message.kind } });
    if (!row || !row.isActive) return message;

    return {
      ...message,
      subject: fillPlaceholders(row.subject, message.context),
      text: fillPlaceholders(row.body, message.context),
      html: row.html ? fillEmailHtml(row.html, message.context) : undefined,
    };
  } catch (error) {
    console.error("[mail] could not read a message template:", error);
    return message;
  }
}
