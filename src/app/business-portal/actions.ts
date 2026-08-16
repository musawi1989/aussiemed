"use server";

import { revalidatePath } from "next/cache";
import { acknowledgePurchaseOrder, markDispatched } from "@/lib/supplier-portal";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function refresh(poNumber: string) {
  revalidatePath("/business-portal");
  if (poNumber) revalidatePath(`/business-portal/orders/${poNumber}`);
}

export async function acknowledgeAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await acknowledgePurchaseOrder(text(data, "id"));
  if (result.ok) refresh(text(data, "poNumber"));
  return result.ok
    ? { ok: true, message: "Acknowledged. Thank you." }
    : { ok: false, error: result.error };
}

export async function dispatchAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await markDispatched(text(data, "id"), {
    courier: text(data, "courier") || null,
    trackingNumber: text(data, "trackingNumber") || null,
  });
  if (result.ok) refresh(text(data, "poNumber"));
  return result.ok
    ? { ok: true, message: "Marked as despatched." }
    : { ok: false, error: result.error };
}
