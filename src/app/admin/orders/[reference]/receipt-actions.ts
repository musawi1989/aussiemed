"use server";

import { revalidatePath } from "next/cache";
import {
  addDeliveryReceipt,
  removeDeliveryReceipt,
} from "@/lib/delivery-receipts";
import type { FormState } from "@/components/AdminForm";

/**
 * Uploading and removing the signed delivery note.
 *
 * Its own file rather than joining the order's actions, because this one takes
 * a FILE. Everything in there is text off a form and reads as such; a
 * multipart handler in the middle of it is the odd one out, and the bytes
 * arrive on a different path with different failure modes.
 */

const text = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();

export async function addDeliveryReceiptAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const reference = text(data, "reference");
  const file = data.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }

  const result = await addDeliveryReceipt(
    reference,
    { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) },
    {
      receivedByName: text(data, "receivedByName"),
      receivedOn: text(data, "receivedOn"),
      note: text(data, "note"),
    }
  );

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/orders/${reference}`);
  return { ok: true, message: "Receipt added." };
}

export async function removeDeliveryReceiptAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await removeDeliveryReceipt(text(data, "id"));
  if (!result.ok) return { ok: false, error: result.error };

  // The reference is not posted here — the button sits in a list on one order
  // and the layout above it is what needs redrawing.
  revalidatePath("/admin/orders", "layout");
  return { ok: true, message: "Removed." };
}
