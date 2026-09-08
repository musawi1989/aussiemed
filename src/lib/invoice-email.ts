import "server-only";

import { db } from "./db";
import { sellerIdentity } from "./seller-identity";
import { invoiceCompliance } from "./trn";
import { requireAdmin } from "./admin";
import { accountSession } from "./account";
import { isSendableAddress, taxInvoice } from "./email-message";
import {
  discountLabel,
  lineDiscount,
  orderDiscount,
  sourceLabel,
} from "./order-discounts";
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
  /** Why not, in the words the document itself uses. */
  reasons: string[];
  alreadySentTo: string | null;
} | null> {
  await requireAdmin("orders", "view");

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

  const seller = await sellerIdentity();

  const tax = invoiceCompliance({
    sellerTrn: seller.trn,
    buyerTrn: order.organisation?.trn,
  });

  const previous = await db.outboundEmail.findFirst({
    where: { kind: "TaxInvoice", entity: "Order", entityId: order.id, status: "Sent" },
    orderBy: { sentAt: "desc" },
    select: { toAddress: true },
  });

  return {
    to: snapshotEmail ?? order.user?.email ?? null,
    organisationName: order.organisation?.name ?? "",
    contactName: snapshotContact ?? order.user?.name ?? "",
    // Both TRNs, per AC-03 — and it really is both now. This read the
    // customer's alone, so putting a TRN on a test account was enough to mark
    // an emailable invoice compliant while AussieMed had none.
    compliant: tax.compliant,
    // The reasons travel with it. The panel used to state one cause of its own
    // — "no TRN is held for this customer" — which stopped being true the
    // moment a customer had one and the fault lay at our end instead.
    reasons: tax.reasons,
    alreadySentTo: previous?.toAddress ?? null,
  };
}

export async function emailInvoice(
  reference: string,
  to: string
): Promise<Result<{ status: string; to: string }>> {
  await requireAdmin("orders");
  return sendInvoiceTo(reference, to);
}

/**
 * A customer emailing themselves their own invoice.
 *
 * Deliberately takes no address: it goes to the address on the account and
 * nowhere else. Letting a buyer type a destination would turn a convenience
 * into a way to post someone else's invoice anywhere, and the account holder
 * already has the printable page in front of them if they want to forward it.
 *
 * The order is looked up by reference *within their own organisation*, so a
 * guessed reference belonging to another clinic finds nothing.
 */
export async function emailMyInvoice(
  reference: string
): Promise<Result<{ status: string; to: string }>> {
  const session = await accountSession();
  if (!session) {
    return { ok: false, error: "Sign in to email yourself an invoice." };
  }

  const own = await db.order.findFirst({
    where: { reference, organisationId: session.organisationId },
    select: { reference: true },
  });
  if (!own) return { ok: false, error: "That order is not on your account." };

  if (!isSendableAddress(session.email)) {
    return {
      ok: false,
      error: "There is no usable email address on your account.",
    };
  }

  return sendInvoiceTo(reference, session.email);
}

async function sendInvoiceTo(
  reference: string,
  to: string
): Promise<Result<{ status: string; to: string }>> {
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

  // What the account's terms took off, read from the snapshot on each line —
  // the same function the printed invoice and the checkout summary use, so the
  // three cannot disagree.
  const saved = orderDiscount(order.items);

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
        discountNote: discountLabel(
          lineDiscount(item),
          order.accountDiscountBasisPoints
        ),
      })),
      listSubtotalFils: saved.discounted ? saved.listSubtotalFils : null,
      discountRows: saved.sources
        .filter((source) => saved.savingBySource[source] > 0)
        .map((source) => ({
          label: sourceLabel(
            source,
            source === "AccountDiscount"
              ? order.accountDiscountBasisPoints
              : undefined
          ),
          amountFils: saved.savingBySource[source],
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
