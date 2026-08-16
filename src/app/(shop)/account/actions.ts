"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addBranch,
  addStaff,
  archiveBranch,
  removeStaff,
} from "@/lib/account";
import { addToCart, clearCart } from "@/lib/orders";
import { ensureCartKey } from "@/lib/cart-cookie";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function refresh() {
  revalidatePath("/account");
  revalidatePath("/account/branches");
  revalidatePath("/account/staff");
}

/* ---------------- branches ---------------- */

export async function addBranchAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await addBranch({
    label: text(data, "label"),
    contact: text(data, "contact"),
    phone: text(data, "phone"),
    line1: text(data, "line1"),
    line2: text(data, "line2"),
    city: text(data, "city"),
    emirate: text(data, "emirate"),
  });
  if (result.ok) refresh();
  return result.ok
    ? { ok: true, message: "Branch added." }
    : { ok: false, error: result.error };
}

export async function removeBranchAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await archiveBranch(text(data, "branchId"));
  if (result.ok) refresh();
  return result.ok
    ? { ok: true, message: "Branch removed. Its past orders are unchanged." }
    : { ok: false, error: result.error };
}

/* ---------------- staff ---------------- */

export async function addStaffAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await addStaff(text(data, "name"), text(data, "email"));
  if (result.ok) refresh();
  return result.ok
    ? { ok: true, message: "Added to the list." }
    : { ok: false, error: result.error };
}

export async function removeStaffAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await removeStaff(text(data, "staffId"));
  if (result.ok) refresh();
  return result.ok
    ? { ok: true, message: "Removed. The orders they placed are unchanged." }
    : { ok: false, error: result.error };
}

/* ---------------- reorder ---------------- */

/**
 * Puts a past order back in the basket.
 *
 * The lines posted are the ones still ticked, so anything the buyer removed on
 * the review screen simply is not here. "keepCart" decides whether what was
 * already in the basket survives — asked on the screen rather than guessed,
 * because both answers are reasonable and getting it wrong silently discards
 * work.
 */
export async function reorderAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const codes = data.getAll("skuCode").map(String);
  const quantities = data.getAll("qty").map(String);
  const keepCart = data.get("keepCart") === "yes";

  if (codes.length === 0) {
    return { ok: false, error: "Nothing is ticked to reorder." };
  }

  const cartKey = await ensureCartKey();
  if (!keepCart) await clearCart(cartKey);

  const failed: string[] = [];
  for (const [index, skuCode] of codes.entries()) {
    const qty = Math.max(1, Number(quantities[index] ?? 1));
    try {
      await addToCart(cartKey, skuCode, qty);
    } catch {
      // One retired line must not lose the rest of the order.
      failed.push(skuCode);
    }
  }

  if (failed.length === codes.length) {
    return {
      ok: false,
      error: "None of those lines could be added — they are no longer available.",
    };
  }

  redirect("/cart");
}
