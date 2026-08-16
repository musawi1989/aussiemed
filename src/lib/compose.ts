import "server-only";

import { db } from "./db";
import { requireAdmin } from "./admin";
import { isSendableAddress, type EmailMessage } from "./email-message";
import { findCustomerLeaks, findTemplate } from "./email-templates";
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
  await requireAdmin();

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
  await requireAdmin();

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
  await requireAdmin();

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

const dubaiDay = (at: Date | null) =>
  at
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dubai",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(at)
    : null;

export async function draftFromTemplate(input: {
  templateId: string;
  reference?: string | null;
}): Promise<Result<{ subject: string; body: string }>> {
  await requireAdmin();

  const template = findTemplate(input.templateId);
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
            user: { select: { name: true } },
            organisation: { select: { name: true } },
          },
        })
      : null;

    if (template.needsOrder && !order) {
      return { ok: false, error: "Choose an order for this one." };
    }

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
        },
      })
    : null;

  if (template.needsOrder && !po) {
    return { ok: false, error: "Choose a purchase order for this one." };
  }

  return {
    ok: true,
    value: template.render({
      poNumber: po?.poNumber ?? "",
      supplierName: po?.supplier.companyName ?? null,
      raisedOn: dubaiDay(po?.sentAt ?? null),
      expectedOn: dubaiDay(po?.expectedAt ?? null),
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
}): Promise<Result<{ status: string }>> {
  const actor = await requireAdmin();

  const to = input.to.trim();
  const subject = input.subject.trim();
  const body = input.body.trim();

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

    const leaks = findCustomerLeaks(`${subject}\n${body}`, identifiers);
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
  };

  const outcome = await send(message, { entity: "Composed", entityId: actor.id });

  if (outcome.status === "Failed" || outcome.status === "Suppressed") {
    return {
      ok: false,
      error: outcome.error ?? "It could not be sent — see the list below.",
    };
  }

  return { ok: true, value: { status: outcome.status } };
}
