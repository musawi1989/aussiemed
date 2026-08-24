"use server";

import { revalidatePath } from "next/cache";
import {
  addToMySupply,
  offersNeedApproval,
  removeFromMySupply,
} from "@/lib/supply-offers";
import {
  acknowledgePurchaseOrder,
  markDispatched,
  setMyAvailability,
  updateMySupply,
  confirmQuantities,
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
    supplyStatus: text(data, "supplyStatus"),
    alternativeSkuId: text(data, "alternativeSkuId") || null,
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

/**
 * What this supplier can send of each line.
 *
 * The form posts one lineId and one qty per row, in step, which is how the
 * receive form on the admin side does it too. An empty box is null — "not
 * said" — rather than zero, because those are different promises.
 */
export async function confirmQuantitiesAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const purchaseOrderId = String(data.get("id") ?? "");
  const lineIds = data.getAll("lineId").map(String);
  const raw = data.getAll("qtyConfirmed").map(String);

  const quantities = lineIds.map((lineId, index) => {
    const value = (raw[index] ?? "").trim();
    return { lineId, qty: value === "" ? null : Number(value) };
  });

  const result = await confirmQuantities(purchaseOrderId, quantities);
  if (!result.ok) return { ok: false, error: result.error };

  const said = quantities.filter((q) => q.qty !== null).length;

  revalidatePath("/business-portal");
  revalidatePath(`/business-portal/orders/${String(data.get("poNumber") ?? "")}`);
  // Ours too: the buying run and the order screen both read these.
  revalidatePath("/admin/purchasing");

  return {
    ok: true,
    message:
      said === 0
        ? "Cleared. We will take it none of these are confirmed yet."
        : `Thank you — ${said} ${said === 1 ? "line" : "lines"} confirmed.`,
  };
}

/** Add one catalogue item to this supplier's own list. */
export async function addToMySupplyAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await addToMySupply(String(data.get("skuId") ?? ""));
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/business-portal/supplies");
  // The browse page re-renders after any server action regardless, so the row
  // just added now shows as theirs instead of vanishing.
  revalidatePath("/business-portal/supplies/add");  // Ours too: an offer is a candidate the Cover screen can now allocate.
  revalidatePath("/admin/suppliers/cover");
  revalidatePath("/admin/products/unallocated");

  const pending = await offersNeedApproval();
  return {
    ok: true,
    message: pending
      ? "Added — we will confirm it shortly."
      : "Added to your list.",
  };
}

/** Take an offer back off it. Cover we agreed cannot be dropped from here. */
export async function removeFromMySupplyAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await removeFromMySupply(String(data.get("supplyId") ?? ""));
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/business-portal/supplies");
  revalidatePath("/admin/products/unallocated");
  return { ok: true, message: "Removed from your list." };
}
