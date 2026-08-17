import "server-only";

import { db } from "./db";
import { orderProgressed, isSendableAddress } from "./email-message";
import { sendQuietly } from "./mailer";
import { publicUrl } from "./public-url";
import { orderProgress } from "./order-progress";

/**
 * Telling a customer their order has moved.
 *
 * The client asked for an email at every step. Their own metrics spec says the
 * restock alert should be the only automatic message a customer gets, and I
 * said so; they confirmed, so every step it is — with a switch per step, so
 * turning one off later is a click in Settings rather than a deploy. That way
 * the request is met in full and the concern is answerable without me.
 *
 * Three rules keep it from becoming noise:
 *
 *  1. One email per order per step, ever. Statuses get corrected — an order
 *     moved to Dispatched, back for a re-pack, and out again — and a customer
 *     who receives "on its way" three times stops believing any of them. The
 *     OutboundEmail log is the record, so this survives a restart.
 *
 *  2. Nothing for Pending. Checkout already sends a confirmation, and a second
 *     email seconds later saying the same thing teaches people that ours are
 *     not worth opening.
 *
 *  3. Never blocks the status change. An admin marking twenty orders dispatched
 *     must not have one of them fail because a mail server is down; the send is
 *     quiet and the failure is in the email log where somebody can retry it.
 */

/** Steps that can send. Pending is absent on purpose — see above. */
export const NOTIFIABLE_STEPS = [
  "Processing",
  "Dispatched",
  "Delivered",
  "Cancelled",
] as const;

export type NotifiableStep = (typeof NOTIFIABLE_STEPS)[number];

const settingKey = (step: string) => `notifyCustomerOn${step}`;

/**
 * Default on. The client asked for these, so the useful default is the one
 * they asked for — a feature that ships switched off is a feature nobody
 * discovers they have.
 */
export async function notifyStepEnabled(step: string): Promise<boolean> {
  const row = await db.setting.findUnique({ where: { key: settingKey(step) } });
  return row?.value !== "off";
}

export async function notifySettings(): Promise<Record<string, boolean>> {
  const rows = await db.setting.findMany({
    where: { key: { in: NOTIFIABLE_STEPS.map(settingKey) } },
    select: { key: true, value: true },
  });
  const off = new Set(rows.filter((r) => r.value === "off").map((r) => r.key));

  return Object.fromEntries(
    NOTIFIABLE_STEPS.map((step) => [step, !off.has(settingKey(step))])
  );
}

export async function setNotifyStep(
  step: string,
  enabled: boolean
): Promise<void> {
  const key = settingKey(step);
  await db.setting.upsert({
    where: { key },
    update: { value: enabled ? "on" : "off" },
    create: { key, value: enabled ? "on" : "off" },
  });
}

/**
 * Sends the step email, once.
 *
 * Called after the status has already been written, and deliberately not inside
 * the transaction that wrote it: an email is not part of the order changing,
 * and a mail failure rolling back a dispatch would be a worse outcome than an
 * unsent email.
 */
export async function notifyOrderProgress(input: {
  orderId: string;
  status: string;
}): Promise<void> {
  if (!(NOTIFIABLE_STEPS as readonly string[]).includes(input.status)) return;
  if (!(await notifyStepEnabled(input.status))) return;

  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      reference: true,
      courier: true,
      trackingNumber: true,
      estimatedShipmentOn: true,
      placedByName: true,
      user: { select: { name: true, email: true } },
      shippingSnapshot: true,
      items: {
        orderBy: { nameSnapshot: "asc" },
        select: { qty: true, status: true, nameSnapshot: true, skuCodeSnapshot: true },
      },
    },
  });
  if (!order) return;

  // The address on the order, falling back to the account's. A guest order
  // carries the address it was placed with and no user at all.
  let to = order.user?.email ?? null;
  let contactName = order.user?.name ?? order.placedByName ?? "";
  try {
    const snapshot = JSON.parse(order.shippingSnapshot ?? "{}") as {
      email?: string;
      contact?: string;
    };
    to = snapshot.email ?? to;
    contactName = snapshot.contact ?? contactName;
  } catch {
    // An older snapshot shape is not a reason to skip the email.
  }
  // Narrowed here rather than asserted below: an order with no usable address
  // is not an error, it is a guest checkout somebody mistyped, and the right
  // response is to send nothing.
  if (!to || !isSendableAddress(to)) return;

  /**
   * One per order per step, forever.
   *
   * Keyed on the subject because OutboundEmail records a kind and an entity but
   * not which step — and the subject is per-step by construction. Adding a
   * column would be tidier; using what is already written means this cannot
   * disagree with the log a person reads when they ask "did we email them".
   */
  const message = buildMessage(order, input.status, publicUrl(), to, contactName);
  const already = await db.outboundEmail.findFirst({
    where: {
      kind: "OrderProgress",
      entity: "Order",
      entityId: order.id,
      subject: message.subject,
      status: { in: ["Sent", "Queued"] },
    },
    select: { id: true },
  });
  if (already) return;

  await sendQuietly(message, { entity: "Order", entityId: order.id });
}

function buildMessage(
  order: {
    reference: string;
    courier: string | null;
    trackingNumber: string | null;
    estimatedShipmentOn: Date | null;
    items: { qty: number; status: string; nameSnapshot: string; skuCodeSnapshot: string }[];
  },
  status: string,
  base: string,
  to: string,
  contactName: string
) {
  // Only what is genuinely still coming, and only when some of it has gone —
  // on an order where nothing shipped, "still to follow" is every line and
  // says nothing.
  const shipped = order.items.filter((i) => i.status === "Shipped");
  const waiting = order.items.filter(
    (i) => i.status !== "Shipped" && i.status !== "Cancelled"
  );
  const outstanding =
    shipped.length > 0 && waiting.length > 0
      ? waiting
          .slice(0, 12)
          .map((i) => `  ${i.qty} x ${i.nameSnapshot} (${i.skuCodeSnapshot})`)
          .join("\n")
      : null;

  const day = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Dubai",
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(d)
      : null;

  return orderProgressed({
    to,
    contactName,
    reference: order.reference,
    status,
    orderUrl: `${base}/orders/${order.reference}`,
    courier: order.courier,
    trackingNumber: order.trackingNumber,
    expectedOn: day(order.estimatedShipmentOn),
    itemsOutstanding: outstanding,
  });
}

/** The customer's own word for a step, for the Settings screen. */
export function stepLabel(step: string): string {
  return orderProgress(step).headline;
}
