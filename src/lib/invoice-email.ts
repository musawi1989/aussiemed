import "server-only";

import { db } from "./db";
import { requireAdmin } from "./admin";
import { isSendableAddress, taxInvoice } from "./email-message";
import { send } from "./mailer";
import { publicUrl } from "./public-url";

/**
 * Sending a customer their invoice.
 *
 * The wording is built by the pure template, from the order as it was stored,
 * so the email and the printed document say the same thing. It is plain text
 * with a link to the printable version rather than a PDF attachment: nothing
 * here generates PDFs, and an email claiming to attach an invoice that it
 * cannot produce would be worse than one that links to it honestly.
 */

export type Result<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Who it would go to, and what state the document is in, before sending. */
export async function invoiceRecipient(reference: string): Promise<{
  to: string | null;
  organisationName: string;
  contactName: string;
  compliant: boolean;
  alreadySentTo: string | null;
} | null> {
  await requireAdmin();

  const order = await db.order.findUnique({
    where: { reference },
    select: {
      id: true,
      shippingSnapshot: true,
      user: { select: { name: true, email: true } },
      organisation: { select: { name: true, trn: true } },
    },
  });
  if (!order) return null;

  // The address the order was placed with comes first: it is what the customer
  // gave at the time, and an account's contact may have changed since.
  let snapshotEmail: string | null = null;
  let snapshotContact: string | null = null;
  try {
    const snapshot = JSON.parse(order.shippingSnapshot ?? "{}") as {
      email?: string;
      contact?: string;
    };
    snapshotEmail = snapshot.email ?? null;
    snapshotContact = snapshot.contact ?? null;
  } catch {
    // An older snapshot shape must not stop an invoice being sent.
  }

  const previous = await db.outboundEmail.findFirst({
    where: { kind: "TaxInvoice", entity: "Order", entityId: order.id, status: "Sent" },
    orderBy: { sentAt: "desc" },
    select: { toAddress: true },
  });

  return {
    to: snapshotEmail ?? order.user?.email ?? null,
    organisationName: order.organisation?.name ?? "",
    contactName: snapshotContact ?? order.user?.name ?? "",
    // Both TRNs, per AC-03. Ours is not captured anywhere yet, so this is
    // false today and the template says so on the document.
    compliant: Boolean(order.organisation?.trn),
    alreadySentTo: previous?.toAddress ?? null,
  };
}

export async function emailInvoice(
  reference: string,
  to: string
): Promise<Result<{ status: string; to: string }>> {
  await requireAdmin();

  const address = to.trim();
  if (!isSendableAddress(address)) {
    return { ok: false, error: "That does not look like an email address." };
  }

  const order = await db.order.findUnique({
    where: { reference },
    include: {
      organisation: { select: { name: true, trn: true } },
      user: { select: { name: true } },
      items: { orderBy: { nameSnapshot: "asc" } },
    },
  });
  if (!order) return { ok: false, error: "That order no longer exists." };
  if (order.items.length === 0) {
    return { ok: false, error: "That order has no lines to invoice." };
  }

  // The two bases, exactly as the printed document splits them.
  const standardNetFils = order.items
    .filter((i) => i.taxClassSnapshot !== "ZeroRated")
    .reduce((n, i) => n + i.lineTotalFils, 0);
  const zeroRatedNetFils = order.items
    .filter((i) => i.taxClassSnapshot === "ZeroRated")
    .reduce((n, i) => n + i.lineTotalFils, 0);

  let contactName = order.user?.name ?? "";
  try {
    const snapshot = JSON.parse(order.shippingSnapshot ?? "{}") as { contact?: string };
    contactName = snapshot.contact ?? contactName;
  } catch {
    /* an older snapshot shape is not a reason to fail */
  }

  const outcome = await send(
    taxInvoice({
      to: address,
      contactName,
      organisationName: order.organisation?.name ?? "",
      reference: order.reference,
      placedAt: order.placedAt,
      lines: order.items.map((item) => ({
        name: item.nameSnapshot,
        skuCode: item.skuCodeSnapshot,
        qty: item.qty,
        unitPriceFils: item.unitPriceFils,
        vatFils: item.vatFils,
        lineTotalFils: item.lineTotalFils,
        zeroRated: item.taxClassSnapshot === "ZeroRated",
      })),
      standardNetFils,
      zeroRatedNetFils,
      vatFils: order.vatFils,
      totalFils: order.totalFils,
      vatRatePercent: order.vatRateBasisPoints / 100,
      poReference: order.poReference,
      // AC-03: neither TRN is held yet. Passed through rather than faked, and
      // the template prints the warning when either is missing.
      sellerTrn: null,
      buyerTrn: order.organisation?.trn ?? null,
      documentUrl: `${publicUrl()}/admin/orders/${order.reference}/tax-invoice`,
    }),
    {
      entity: "Order",
      entityId: order.id,
      // Keyed on the address so a second copy can be sent to the accounts
      // department without the first send blocking it, but the same address
      // twice is caught.
      dedupeKey: `TaxInvoice:${order.reference}:${address}`,
    }
  );

  if (outcome.status === "Failed" || outcome.status === "Suppressed") {
    return {
      ok: false,
      error: outcome.error ?? "It could not be sent — see Email for the reason.",
    };
  }

  return { ok: true, value: { status: outcome.status, to: address } };
}
