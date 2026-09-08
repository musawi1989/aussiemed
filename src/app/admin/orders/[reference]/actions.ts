"use server";

import { revalidatePath } from "next/cache";
import {
  setOrderDelivery,
  setOrderInternalNotes,
  setOrderLineBatch,
  setOrderPayment,
  setOrderStatus,
} from "@/lib/admin";
import { emailInvoice } from "@/lib/invoice-email";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

const done = (reference: string) => {
  revalidatePath(`/admin/orders/${reference}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/orders/board");
  revalidatePath("/admin");
};

export async function setOrderStatusAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const reference = text(data, "reference");
  const result = await setOrderStatus(reference, text(data, "status"));
  if (!result.ok) return { ok: false, error: result.error };
  done(reference);
  return { ok: true, message: `Order moved to ${text(data, "status")}.` };
}

export async function setPaymentAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const reference = text(data, "reference");
  const paidRaw = text(data, "paidAED");

  const result = await setOrderPayment(
    reference,
    text(data, "paymentStatus"),
    paidRaw === "" ? null : Number(paidRaw),
    // An empty string clears the due date; absent means leave it alone.
    data.has("paymentDueOn") ? text(data, "paymentDueOn") : null
  );
  if (!result.ok) return { ok: false, error: result.error };
  done(reference);
  return { ok: true, message: "Payment updated." };
}

export async function setDeliveryAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const reference = text(data, "reference");
  const result = await setOrderDelivery(reference, {
    deliveryType: text(data, "deliveryType"),
    courier: text(data, "courier") || null,
    trackingNumber: text(data, "trackingNumber") || null,
    estimatedShipmentOn: text(data, "estimatedShipmentOn") || null,
  });
  if (!result.ok) return { ok: false, error: result.error };
  done(reference);
  return { ok: true, message: "Delivery details saved." };
}

export async function setInternalNotesAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const reference = text(data, "reference");
  const result = await setOrderInternalNotes(
    reference,
    text(data, "internalNotes") || null
  );
  if (!result.ok) return { ok: false, error: result.error };
  done(reference);
  return { ok: true, message: "Note saved. The customer cannot see it." };
}

export async function setLineBatchAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const reference = text(data, "reference");
  const result = await setOrderLineBatch(
    text(data, "itemId"),
    text(data, "batchCode") || null,
    text(data, "expiresOn") || null
  );
  if (!result.ok) return { ok: false, error: result.error };
  done(reference);
  return { ok: true, message: "Lot recorded." };
}

/**
 * Email the tax invoice for this order.
 *
 * Lived in the inbox's actions file, which is where the "send this on to
 * somebody" code happened to sit. The inbox has gone and this has nothing to
 * do with it — it belongs beside the order screen that offers the button.
 */
export async function emailInvoiceAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const to = text(data, "to");
  const result = await emailInvoice(text(data, "reference"), to);

  if (!result.ok) return { ok: false, error: result.error, values: { to } };

  revalidatePath(`/admin/orders/${text(data, "reference")}`);
  revalidatePath("/admin/emails");
  return {
    ok: true,
    message:
      result.value.status === "Duplicate"
        ? `Already sent to ${result.value.to} — nothing sent again.`
        : `Invoice sent to ${result.value.to}.`,
  };
}
