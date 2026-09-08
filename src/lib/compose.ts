import "server-only";
import { fillEmailHtml, safeEmailHtml, validateAttachments } from "./email-html";

import { db } from "./db";
import { requireAdmin } from "./admin";
import { isSendableAddress, type EmailMessage } from "./email-message";
import {
  fillPlaceholders,
  findCustomerLeaks,
  findTemplate,
  type TemplateAudience,
} from "./email-templates";
import { send } from "./mailer";
import { formatAED } from "./money";

/**
 * Writing an email by hand, from the back office.
 *
 * The templates are a starting point and the admin edits before sending, so
 * what goes out is whatever they approved. Two things are still checked on
 * the way past, because neither is a matter of taste:
 *
 *  - the address has to be one we could send to
 *  - a message bound for a supplier must not name a customer
 *
 * The second is DEC-24. Nothing can stop somebody typing a clinic's name into
 * the box, but the send path can notice and refuse, and the cost of catching a
 * genuine mistake is one edit.
 */

export type Result<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/* ------------------------------------------------------------------ *
 * Who can be written to
 * ------------------------------------------------------------------ */

export type RecipientOption = {
  value: string;
  label: string;
  audience: "Customer" | "Supplier";
};

export async function recipients(): Promise<{
  customers: RecipientOption[];
  suppliers: RecipientOption[];
}> {
  await requireAdmin("email", "view");

  const [users, supplierRows] = await Promise.all([
    db.user.findMany({
      where: { role: "Customer", isDisabled: false },
      orderBy: { name: "asc" },
      select: {
        name: true,
        email: true,
        organisation: { select: { name: true } },
      },
    }),
    db.supplier.findMany({
      where: { status: "Active" },
      orderBy: { companyName: "asc" },
      select: { companyName: true, primaryEmail: true, secondaryEmail: true },
    }),
  ]);

  const customers = users
    .filter((user) => isSendableAddress(user.email))
    .map((user) => ({
      value: user.email,
      // The account first: an admin is thinking "the Al Barsha order", not
      // "Musawi's order".
      label: user.organisation?.name
        ? `${user.organisation.name} — ${user.name} (${user.email})`
        : `${user.name} (${user.email})`,
      audience: "Customer" as const,
    }));

  const suppliers: RecipientOption[] = [];
  for (const supplier of supplierRows) {
    // Both addresses, labelled, because which one to use is a judgement: an
    // order chase goes to orders@, an invoice query to accounts@.
    for (const [address, role] of [
      [supplier.primaryEmail, "orders"],
      [supplier.secondaryEmail, "second address"],
    ] as const) {
      if (!isSendableAddress(address)) continue;
      if (suppliers.some((s) => s.value === address)) continue;
      suppliers.push({
        value: address,
        label: `${supplier.companyName} — ${role} (${address})`,
        audience: "Supplier",
      });
    }
  }

  return { customers, suppliers };
}

/** Orders an admin might be writing about, newest first. */
export async function recentOrders(limit = 40) {
  await requireAdmin("email", "view");

  const orders = await db.order.findMany({
    orderBy: { placedAt: "desc" },
    take: limit,
    select: {
      reference: true,
      placedAt: true,
      status: true,
      totalFils: true,
      paymentDueOn: true,
      courier: true,
      trackingNumber: true,
      estimatedShipmentOn: true,
      placedByName: true,
      user: { select: { name: true, email: true } },
      organisation: { select: { name: true } },
    },
  });

  return orders.map((order) => ({
    reference: order.reference,
    label: `${order.reference} — ${order.organisation?.name ?? order.user?.name ?? "guest"} · ${formatAED(order.totalFils / 100)}`,
    email: order.user?.email ?? null,
  }));
}

export async function recentPurchaseOrders(limit = 40) {
  await requireAdmin("email", "view");

  const orders = await db.purchaseOrder.findMany({
    where: { status: { not: "Draft" } },
    orderBy: { sentAt: "desc" },
    take: limit,
    select: {
      poNumber: true,
      sentAt: true,
      expectedAt: true,
      supplier: { select: { companyName: true, primaryEmail: true } },
    },
  });

  return orders.map((po) => ({
    poNumber: po.poNumber,
    label: `${po.poNumber} — ${po.supplier.companyName}`,
    email: po.supplier.primaryEmail,
  }));
}

/* ------------------------------------------------------------------ *
 * Filling a template in
 * ------------------------------------------------------------------ */

/**
 * The lines, written the way they would be read out on the phone.
 *
 * Indented and one per line, because these go into a plain-text email where a
 * comma-separated run of seven medical product names is unreadable. Capped,
 * since a template is a starting point and nobody wants forty lines pasted
 * into a note they are about to edit — the count says what was left off rather
 * than the list quietly stopping.
 */
const MAX_LISTED = 12;

function writeItems(
  items: { qty: number; name: string; skuCode: string }[]
): string | null {
  if (items.length === 0) return null;

  const shown = items
    .slice(0, MAX_LISTED)
    .map((item) => `  ${item.qty} x ${item.name} (${item.skuCode})`);

  if (items.length > MAX_LISTED) {
    const rest = items.length - MAX_LISTED;
    shown.push(`  and ${rest} more line${rest === 1 ? "" : "s"}`);
  }
  return shown.join("\n");
}

const dubaiDay = (at: Date | null) =>
  at
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dubai",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(at)
    : null;

/**
 * The template behind an id, whether it is one of ours or one of theirs.
 *
 * SAVED TEMPLATES ARE ADAPTED TO THE SAME SHAPE rather than given their own
 * branch through the drafting code. Everything below this line — the order
 * lookup, the item lists, the leak check on the way out — has to behave
 * identically for both, and the surest way to get that is for there to be only
 * one path. What differs is one function: ours writes with code, theirs fills
 * in blanks.
 *
 * The "saved:" prefix keeps the two id spaces apart. A saved template called
 * the same thing as a built-in cannot shadow it, and an id in a stale form
 * that no longer resolves is a clean refusal rather than the wrong email.
 */
const SAVED_PREFIX = "saved:";

type Resolved = {
  audience: TemplateAudience;
  needsOrder: boolean;
  render: (context: Record<string, unknown>) => { subject: string; body: string; html?: string };
};

async function resolveTemplate(id: string): Promise<Resolved | null> {
  if (!id.startsWith(SAVED_PREFIX)) {
    const built = findTemplate(id);
    return built
      ? {
          audience: built.audience,
          needsOrder: built.needsOrder,
          render: (context) =>
            built.render(context as never),
        }
      : null;
  }

  const saved = await db.savedEmailTemplate.findUnique({
    where: { id: id.slice(SAVED_PREFIX.length) },
  });
  if (!saved) return null;

  return {
    audience: saved.audience === "Supplier" ? "Supplier" : "Customer",
    needsOrder: saved.needsOrder,
    render: (context) => ({
      subject: fillPlaceholders(saved.subject, context),
      body: fillPlaceholders(saved.body, context),
      html: saved.html ? fillEmailHtml(saved.html, context) : undefined,
    }),
  };
}

export async function draftFromTemplate(input: {
  templateId: string;
  reference?: string | null;
}): Promise<Result<{ subject: string; body: string; html?: string }>> {
  await requireAdmin("email", "view");

  const template = await resolveTemplate(input.templateId);
  if (!template) return { ok: false, error: "That template no longer exists." };

  if (template.audience === "Customer") {
    const order = input.reference
      ? await db.order.findUnique({
          where: { reference: input.reference },
          select: {
            reference: true,
            placedAt: true,
            totalFils: true,
            paymentDueOn: true,
            courier: true,
            trackingNumber: true,
            estimatedShipmentOn: true,
            placedByName: true,
            poReference: true,
            user: { select: { name: true } },
            organisation: { select: { name: true } },
            address: { select: { label: true, city: true } },
            items: {
              orderBy: { nameSnapshot: "asc" },
              select: {
                qty: true,
                status: true,
                nameSnapshot: true,
                skuCodeSnapshot: true,
              },
            },
          },
        })
      : null;

    if (template.needsOrder && !order) {
      return { ok: false, error: "Choose an order for this one." };
    }

    const lines = (order?.items ?? []).map((item) => ({
      qty: item.qty,
      name: item.nameSnapshot,
      skuCode: item.skuCodeSnapshot,
      status: item.status,
    }));

    // Shipped means gone; anything not shipped or cancelled is still owed.
    const shipped = lines.filter((l) => l.status === "Shipped");
    const outstanding = lines.filter(
      (l) => l.status !== "Shipped" && l.status !== "Cancelled"
    );

    return {
      ok: true,
      value: template.render({
        reference: order?.reference ?? "",
        contactName: order?.user?.name ?? order?.placedByName ?? null,
        organisationName: order?.organisation?.name ?? null,
        placedOn: dubaiDay(order?.placedAt ?? null),
        totalLabel: order ? formatAED(order.totalFils / 100) : null,
        dueOn: dubaiDay(order?.paymentDueOn ?? null),
        courier: order?.courier ?? null,
        trackingNumber: order?.trackingNumber ?? null,
        expectedOn: dubaiDay(order?.estimatedShipmentOn ?? null),
        branchLabel: order?.address?.label ?? order?.address?.city ?? null,
        poReference: order?.poReference ?? null,
        itemsAll: writeItems(lines),
        itemsShipped: writeItems(shipped),
        // Only worth saying when it is a subset — on an order where nothing
        // has shipped, "still to come" is every line and adds nothing over
        // "on the order".
        itemsOutstanding:
          shipped.length > 0 ? writeItems(outstanding) : null,
        // Specifically the lines that cannot be supplied, so the template that
        // says so does not go on to list six that can.
        itemsBackordered: writeItems(
          lines.filter((l) => l.status === "Backordered")
        ),
      }),
    };
  }

  // Supplier. Nothing about a customer is read, so nothing about a customer
  // can be filled in — see DEC-24 and the tests on email-templates.
  const po = input.reference
    ? await db.purchaseOrder.findUnique({
        where: { poNumber: input.reference },
        select: {
          poNumber: true,
          sentAt: true,
          expectedAt: true,
          supplier: { select: { companyName: true } },
          lines: {
            orderBy: { nameSnapshot: "asc" },
            select: {
              qtyOrdered: true,
              qtyReceived: true,
              nameSnapshot: true,
              skuCodeSnapshot: true,
              supplierPartNumberSnapshot: true,
            },
          },
        },
      })
    : null;

  if (template.needsOrder && !po) {
    return { ok: false, error: "Choose a purchase order for this one." };
  }

  // Their own part number leads, as on the purchase order itself: their picker
  // works from their catalogue, not ours.
  const poLines = (po?.lines ?? []).map((line) => ({
    qty: line.qtyOrdered,
    name: line.nameSnapshot,
    skuCode: line.supplierPartNumberSnapshot ?? line.skuCodeSnapshot,
    outstanding: line.qtyOrdered - line.qtyReceived,
  }));

  return {
    ok: true,
    value: template.render({
      poNumber: po?.poNumber ?? "",
      supplierName: po?.supplier.companyName ?? null,
      raisedOn: dubaiDay(po?.sentAt ?? null),
      expectedOn: dubaiDay(po?.expectedAt ?? null),
      itemsAll: writeItems(poLines),
      itemsOutstanding: writeItems(
        poLines
          .filter((l) => l.outstanding > 0)
          .map((l) => ({ ...l, qty: l.outstanding }))
      ),
    }),
  };
}

/* ------------------------------------------------------------------ *
 * Sending it
 * ------------------------------------------------------------------ */

export async function sendComposed(input: {
  to: string;
  audience: "Customer" | "Supplier";
  subject: string;
  body: string;
  html?: string;
  attachments?: EmailMessage["attachments"];
}): Promise<Result<{ status: string }>> {
  const actor = await requireAdmin("email");

  const to = input.to.trim();
  const subject = input.subject.trim();
  const body = input.body.trim();
  const html = input.html?.trim() ? safeEmailHtml(input.html) : undefined;
  if ((input.html?.length ?? 0) > 100000 || body.length > 100000) return { ok: false, error: "Keep the message under 100,000 characters." };
  const attachmentError = validateAttachments(input.attachments ?? []);
  if (attachmentError) return { ok: false, error: attachmentError };

  if (!isSendableAddress(to)) {
    return { ok: false, error: "That does not look like an email address." };
  }
  if (subject.length < 3) {
    return { ok: false, error: "Give it a subject — an empty one reads as spam." };
  }
  if (body.length < 10) {
    return { ok: false, error: "There is no message to send yet." };
  }

  if (input.audience === "Supplier") {
    // Every name and reference a supplier must never see. Read at send time
    // rather than trusted from the form, so an edited body is checked too.
    const [customers, organisations, orders] = await Promise.all([
      db.user.findMany({
        where: { role: "Customer" },
        select: { name: true, email: true },
      }),
      db.organisation.findMany({ select: { name: true } }),
      db.order.findMany({ select: { reference: true } }),
    ]);

    const identifiers = [
      ...customers.flatMap((c) => [c.name, c.email]),
      ...organisations.map((o) => o.name),
      ...orders.map((o) => o.reference),
    ].filter(Boolean);

    const signature = await db.user.findUnique({ where: { id: actor.id }, select: { emailSignatureHtml: true } });
    const leaks = findCustomerLeaks(`${subject}\n${body}\n${html ?? ""}\n${signature?.emailSignatureHtml ?? ""}`, identifiers);
    if (leaks.length > 0) {
      return {
        ok: false,
        error:
          `This is going to a supplier and mentions ${leaks.join(", ")}. ` +
          `A supplier never learns who a customer is, so please take that out ` +
          `and send again.`,
      };
    }
  }

  const message: EmailMessage = {
    // Written and addressed by a person, so it is filed as forwarded rather
    // than as one of the generated kinds.
    kind: "Forwarded",
    to,
    subject,
    text: body,
    html,
    attachments: input.attachments,
  };

  const outcome = await send(message, { entity: "Composed", entityId: actor.id, senderUserId: actor.id });

  if (outcome.status === "Failed" || outcome.status === "Suppressed") {
    return {
      ok: false,
      error: outcome.error ?? "It could not be sent — see the list below.",
    };
  }

  return { ok: true, value: { status: outcome.status } };
}
