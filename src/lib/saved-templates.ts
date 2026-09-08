import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";
import type { TemplateAudience } from "./email-templates";
import { safeEmailHtml } from "./email-html";

/**
 * Email templates written here rather than in the code.
 *
 * THE BUILT-IN ONES ARE NOT REPLACED. They are typed functions with tests and
 * a leak check over what they produce, and turning them into rows would trade
 * all of that for the ability to edit a sentence. These sit alongside them in
 * the same picker, marked as yours.
 *
 * PLACEHOLDERS RATHER THAN CODE. A saved template is text with {{reference}}
 * in it, filled from the same order or purchase order context the built-ins
 * receive. Anything unrecognised is left exactly as typed — a stray brace in a
 * sentence is a typo, not a reason to refuse to draft.
 */

const fail = (error: string): Result<never> => ({ ok: false, error });

export type SavedTemplate = {
  id: string;
  name: string;
  audience: TemplateAudience;
  subject: string;
  body: string;
  html: string | null;
  needsOrder: boolean;
  updatedAt: Date;
  updatedByName: string;
};

/** The fields a template may refer to, and what each one is. */
export const PLACEHOLDERS: Record<TemplateAudience, { key: string; note: string }[]> = {
  Customer: [
    { key: "reference", note: "The order number" },
    { key: "contactName", note: "Who placed it" },
    { key: "organisationName", note: "Their company" },
    { key: "placedOn", note: "When it was ordered" },
    { key: "expectedOn", note: "When it is due" },
    { key: "courier", note: "Who is carrying it" },
    { key: "trackingNumber", note: "Consignment number" },
    { key: "totalLabel", note: "Order total" },
    { key: "dueOn", note: "When payment is due" },
    { key: "poReference", note: "Their own PO number" },
    { key: "itemsAll", note: "Every line, one per row" },
    { key: "itemsOutstanding", note: "What has not shipped" },
    { key: "itemsShipped", note: "What has" },
    { key: "itemsBackordered", note: "What cannot be supplied" },
  ],
  Supplier: [
    { key: "poNumber", note: "The purchase order number" },
    { key: "supplierName", note: "Their company" },
    { key: "raisedOn", note: "When we raised it" },
    { key: "expectedOn", note: "When it is due" },
    { key: "itemsAll", note: "Every line, one per row" },
    { key: "itemsOutstanding", note: "What we are still waiting for" },
  ],
};

export async function listSavedTemplates(): Promise<SavedTemplate[]> {
  await requireAdmin("email", "view");

  const rows = await db.savedEmailTemplate.findMany({
    orderBy: [{ audience: "asc" }, { name: "asc" }],
  });
  return rows as SavedTemplate[];
}

export type TemplateInput = {
  name: string;
  audience: string;
  subject: string;
  body: string;
  html?: string;
  needsOrder: boolean;
};

function check(input: TemplateInput) {
  const name = input.name.trim();
  const subject = input.subject.trim();
  const body = input.body.trim();
  const html = input.html?.trim() ? safeEmailHtml(input.html) : null;
  if ((input.html?.length ?? 0) > 100000 || body.length > 100000) return fail("Keep each message under 100,000 characters.");

  if (!name) return fail("Give it a name — it is what you pick from the list.");
  if (!subject) return fail("A template needs a subject.");
  if (!body) return fail("A template needs something in the body.");
  if (input.audience !== "Customer" && input.audience !== "Supplier") {
    return fail("Say whether it is for a customer or a supplier.");
  }

  return {
    ok: true as const,
    value: {
      name,
      subject,
      body,
      html,
      audience: input.audience,
      needsOrder: input.needsOrder,
    },
  };
}

export async function createSavedTemplate(
  input: TemplateInput
): Promise<Result<string>> {
  const actor = await requireAdmin("email");

  const checked = check(input);
  if (!checked.ok) return checked;

  const clash = await db.savedEmailTemplate.findFirst({
    where: { audience: checked.value.audience, name: checked.value.name },
    select: { id: true },
  });
  if (clash) {
    return fail(`There is already a ${checked.value.audience.toLowerCase()} template called that.`);
  }

  const created = await db.savedEmailTemplate.create({
    data: { ...checked.value, updatedByName: actor.name },
    select: { id: true },
  });

  await audit(actor, "emailTemplate.create", "SavedEmailTemplate", created.id, null, checked.value);
  return { ok: true, value: created.id };
}

export async function updateSavedTemplate(
  id: string,
  input: TemplateInput
): Promise<Result> {
  const actor = await requireAdmin("email");

  const existing = await db.savedEmailTemplate.findUnique({ where: { id } });
  if (!existing) return fail("That template no longer exists.");

  const checked = check(input);
  if (!checked.ok) return checked;

  const clash = await db.savedEmailTemplate.findFirst({
    where: {
      audience: checked.value.audience,
      name: checked.value.name,
      NOT: { id },
    },
    select: { id: true },
  });
  if (clash) return fail("Another template already has that name.");

  await db.savedEmailTemplate.update({
    where: { id },
    data: { ...checked.value, updatedByName: actor.name },
  });

  await audit(
    actor,
    "emailTemplate.update",
    "SavedEmailTemplate",
    id,
    { name: existing.name, subject: existing.subject, body: existing.body, html: existing.html },
    checked.value
  );
  return { ok: true, value: undefined };
}

/**
 * Deleted outright, not retired.
 *
 * A template is a convenience for writing the next email, not a record of one.
 * What actually went out is an OutboundEmail row with its own copy of the
 * words — deleting the template it came from changes nothing about what was
 * sent, which is why this one is safe to delete when the packs and the orders
 * are not.
 */
export async function deleteSavedTemplate(id: string): Promise<Result> {
  const actor = await requireAdmin("email");

  const existing = await db.savedEmailTemplate.findUnique({
    where: { id },
    select: { id: true, name: true, audience: true, subject: true, body: true, html: true, needsOrder: true },
  });
  if (!existing) return fail("That template is already gone.");

  await db.savedEmailTemplate.delete({ where: { id } });
  await audit(
    actor,
    "emailTemplate.delete",
    "SavedEmailTemplate",
    id,
    existing,
    null
  );
  return { ok: true, value: undefined };
}
