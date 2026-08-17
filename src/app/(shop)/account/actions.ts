"use server";

import { revalidatePath } from "next/cache";
import { addressPartsFrom } from "@/lib/geo";
import { redirect } from "next/navigation";
import {
  addStaff,
  removeStaff,
  requestAddBranch,
  requestEditBranch,
  requestRemoveBranch,
  requestRenameAccount,
  toggleSavedProduct,
  withdrawAccountChange,
} from "@/lib/account";
import { addToCart, clearCart } from "@/lib/orders";
import { ensureCartKey } from "@/lib/cart-cookie";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/**
 * Everything typed, so a refusal can hand it back.
 *
 * React clears an uncontrolled form as soon as its action returns. Since every
 * change here now needs a reason, refusals are ordinary rather than rare, and
 * one that also wipes the address someone just typed makes the second attempt
 * cost more than the first.
 */
const typed = (data: FormData): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const [key, value] of data.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
};

const refuse = (error: string, data: FormData): FormState => ({
  ok: false,
  error,
  values: typed(data),
});

function refresh() {
  revalidatePath("/account");
  revalidatePath("/account/branches");
  revalidatePath("/account/staff");
  revalidatePath("/account/changes");
}

const branchFrom = (data: FormData) => {
  // Country, region and the dialling prefix are read in one place for all four
  // forms that ask, so they cannot drift into four ideas of an address.
  const where = addressPartsFrom(data);
  return {
    label: text(data, "label"),
    contact: text(data, "contact"),
    phone: where.phone,
    line1: text(data, "line1"),
    line2: text(data, "line2"),
    city: text(data, "city"),
    emirate: where.emirate,
    country: where.country,
    countryCode: where.countryCode,
  };
};

/**
 * One sentence for both outcomes, because a change that took effect and one
 * that is waiting on us are different things and a customer told "saved" for
 * the second would keep ordering to an address that does not exist yet.
 */
const outcome = (applied: boolean, done: string, held: string): FormState =>
  applied ? { ok: true, message: done } : { ok: true, message: held };

/* ---------------- branches ---------------- */

export async function addBranchAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await requestAddBranch(branchFrom(data), text(data, "reason"));
  if (!result.ok) return refuse(result.error, data);
  refresh();
  return outcome(
    result.value.applied,
    "Branch added.",
    "Sent for approval. It will appear once we have checked it — usually the same working day."
  );
}

export async function editBranchAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await requestEditBranch(
    text(data, "branchId"),
    branchFrom(data),
    text(data, "reason")
  );
  if (!result.ok) return refuse(result.error, data);
  refresh();
  return outcome(
    result.value.applied,
    "Branch updated.",
    "Sent for approval. The branch keeps its current details until then."
  );
}

export async function removeBranchAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await requestRemoveBranch(
    text(data, "branchId"),
    text(data, "reason")
  );
  if (!result.ok) return refuse(result.error, data);
  refresh();
  return outcome(
    result.value.applied,
    "Branch removed. Its past orders are unchanged.",
    "Sent for approval. You can still order to it until then."
  );
}

/* ---------------- the account name ---------------- */

export async function renameAccountAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await requestRenameAccount(
    text(data, "name"),
    text(data, "reason")
  );
  if (!result.ok) return refuse(result.error, data);
  refresh();
  return outcome(
    result.value.applied,
    "Account name changed.",
    "Sent for approval. Your invoices keep the current name until then."
  );
}

/* ---------------- staff ---------------- */

export async function addStaffAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await addStaff(
    text(data, "name"),
    text(data, "reason"),
    text(data, "addressId")
  );
  if (!result.ok) return refuse(result.error, data);
  refresh();
  return { ok: true, message: "Added to the list, with your note." };
}

export async function removeStaffAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await removeStaff(text(data, "staffId"), text(data, "reason"));
  if (!result.ok) return refuse(result.error, data);
  refresh();
  return {
    ok: true,
    message: "Removed. The orders they placed are unchanged.",
  };
}

/* ---------------- withdrawing a request ---------------- */

export async function withdrawChangeAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await withdrawAccountChange(text(data, "changeId"));
  if (result.ok) refresh();
  return result.ok
    ? { ok: true, message: "Request withdrawn." }
    : { ok: false, error: result.error };
}

/* ---------------- saved products ---------------- */

/**
 * Called by the heart on a product. Persists for a signed-in account so the
 * saved list follows them between devices and feeds My products; a guest's
 * hearts stay in their own browser.
 */
export async function toggleSavedAction(
  slug: string
): Promise<{ signedIn: boolean; saved: boolean }> {
  const result = await toggleSavedProduct(slug);
  if (!result.ok) return { signedIn: false, saved: false };

  if (result.value.signedIn) {
    revalidatePath("/account/products");
    revalidatePath("/account");
  }
  return result.value;
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
