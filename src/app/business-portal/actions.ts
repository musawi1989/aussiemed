"use server";

import { revalidatePath } from "next/cache";
import {
  acknowledgePurchaseOrder,
  markDispatched,
  setMyAvailability,
  updateMySupply,
} from "@/lib/supplier-portal";
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

/* ---------------- the packs they supply — BE-21 ---------------- */

function refreshSupplies() {
  revalidatePath("/business-portal/supplies");
  revalidatePath("/business-portal");
}

export async function updateSupplyAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await updateMySupply(text(data, "supplyId"), {
    supplierPartNumber: text(data, "supplierPartNumber"),
    costAED: text(data, "costAED"),
    leadTimeDays: text(data, "leadTimeDays"),
    isAvailable: data.get("isAvailable") === "yes",
  });

  if (result.ok) refreshSupplies();
  return result.ok
    ? { ok: true, message: "Saved." }
    : {
        ok: false,
        error: result.error,
        // React clears an uncontrolled form when its action returns, so a
        // refusal would otherwise wipe the row the supplier just typed.
        values: {
          supplierPartNumber: text(data, "supplierPartNumber"),
          costAED: text(data, "costAED"),
          leadTimeDays: text(data, "leadTimeDays"),
        },
      };
}

export async function setAvailabilityAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const available = data.get("available") === "yes";
  const result = await setMyAvailability(available);
  if (result.ok) refreshSupplies();

  return result.ok
    ? {
        ok: true,
        message: available
          ? "You are back on. Orders will come to you as normal."
          : "Marked as unable to supply. Nothing will be ordered from you until you turn this back on.",
      }
    : { ok: false, error: result.error };
}
