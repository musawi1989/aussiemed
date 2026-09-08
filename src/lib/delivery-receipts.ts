import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";
import {
  putPrivateDocument,
  readPrivateDocument,
  removePrivateDocument,
} from "./storage";
import { safeDisplayName } from "./document-file";

/**
 * Proof that the goods arrived — the signed sheet, photographed or scanned.
 *
 * PRIVATE, NOT PUBLIC, and for a plainer reason than the product documents: a
 * receipt carries a person's name and their signature. It is stored as a key
 * outside public/, and the only way back to the bytes is the admin route
 * beside the order. A safety data sheet is meant to be downloaded by anyone;
 * this is not.
 *
 * KEPT RATHER THAN REPLACED. Uploading a second receipt adds a second row. A
 * delivery can go to two doors on two days, a signed sheet can be photographed
 * in three pages, and this is the record somebody reaches for when a customer
 * says it never came — losing the earlier one to make room would be losing the
 * evidence.
 */

const fail = (error: string): Result<never> => ({ ok: false, error });

export type DeliveryReceipt = {
  id: string;
  fileName: string;
  receivedByName: string | null;
  receivedOn: Date | null;
  note: string | null;
  uploadedAt: Date;
  uploadedByName: string;
};

export async function listDeliveryReceipts(
  orderId: string
): Promise<DeliveryReceipt[]> {
  await requireAdmin("orders", "view");

  return db.deliveryReceipt.findMany({
    where: { orderId },
    // Newest first: the question is nearly always about the last delivery.
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      fileName: true,
      receivedByName: true,
      receivedOn: true,
      note: true,
      uploadedAt: true,
      uploadedByName: true,
    },
  });
}

export type ReceiptInput = {
  /** As written on the sheet. Blank is allowed — a photo is still proof. */
  receivedByName?: string | null;
  /** The date beside the signature, which need not be today. */
  receivedOn?: string | null;
  note?: string | null;
};

export async function addDeliveryReceipt(
  reference: string,
  file: { name: string; bytes: Buffer },
  input: ReceiptInput
): Promise<Result> {
  const actor = await requireAdmin("orders");

  const order = await db.order.findUnique({
    where: { reference },
    select: { id: true, reference: true },
  });
  if (!order) return fail("That order no longer exists.");

  const stored = await putPrivateDocument(file.bytes, `receipt-${order.reference}`);
  if (!stored.ok) return fail(stored.error);

  // The fallback extension comes off the stored key, which carries the type
  // the bytes actually turned out to be — so a PNG whose name was unusable
  // does not end up called receipt.pdf.
  const fileName = safeDisplayName(file.name, stored.url.split(".").pop() ?? "pdf");

  const receivedOn = parseDay(input.receivedOn);
  if (receivedOn === "bad") return fail("That is not a date we can read.");

  await db.deliveryReceipt.create({
    data: {
      orderId: order.id,
      storageKey: stored.url,
      fileName,
      receivedByName: trim(input.receivedByName),
      receivedOn,
      note: trim(input.note),
      uploadedByName: actor.name,
    },
  });

  await audit(actor, "deliveryReceipt.add", "Order", order.reference, null, {
    fileName,
    receivedByName: trim(input.receivedByName),
  });

  return { ok: true, value: undefined };
}

/**
 * Take one off, and delete the bytes with it.
 *
 * The row goes first, then the file. The other order leaves a window where a
 * row names bytes that are already gone; this way the worst case is an
 * orphaned file, which costs a few kilobytes and nothing else.
 */
export async function removeDeliveryReceipt(id: string): Promise<Result> {
  const actor = await requireAdmin("orders");

  const receipt = await db.deliveryReceipt.findUnique({
    where: { id },
    select: {
      id: true,
      storageKey: true,
      fileName: true,
      order: { select: { reference: true } },
    },
  });
  if (!receipt) return fail("That receipt is already gone.");

  await db.deliveryReceipt.delete({ where: { id } });
  await removePrivateDocument(receipt.storageKey);

  await audit(
    actor,
    "deliveryReceipt.remove",
    "Order",
    receipt.order.reference,
    receipt.fileName,
    null
  );

  return { ok: true, value: undefined };
}

/**
 * The bytes behind one receipt, for the admin route that serves it.
 *
 * The admin check is here AND on the route. That looks redundant with one
 * caller and stops looking redundant the moment there are two.
 */
export async function readDeliveryReceipt(
  id: string
): Promise<{ name: string; bytes: Buffer } | null> {
  const user = await requireAdmin("orders", "view");
  if (!user) return null;

  const receipt = await db.deliveryReceipt.findUnique({
    where: { id },
    select: { storageKey: true, fileName: true },
  });
  if (!receipt) return null;

  const bytes = await readPrivateDocument(receipt.storageKey);
  return bytes ? { name: receipt.fileName, bytes } : null;
}

const trim = (value: string | null | undefined): string | null => {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : null;
};

/**
 * A date field that is allowed to be empty.
 *
 * Returns "bad" rather than null for something unparseable, so a typo is
 * refused instead of being silently filed as "no date recorded" — which would
 * read afterwards as though nobody had written one on the sheet.
 */
function parseDay(value: string | null | undefined): Date | null | "bad" {
  const text = (value ?? "").trim();
  if (!text) return null;

  const at = new Date(text);
  return Number.isNaN(at.getTime()) ? "bad" : at;
}
