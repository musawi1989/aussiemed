"use server";

import { revalidatePath } from "next/cache";
import {
  approvePriceRequest,
  rejectPriceRequest,
} from "@/lib/supply-pricing";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/**
 * Two actions rather than one with a decision field.
 *
 * Approving pays a supplier more, and it is irreversible in the sense that
 * matters: a purchase order raised a minute later goes out at the new price.
 * A single handler taking "approve" or "reject" from a hidden input is one
 * mistyped value away from doing the opposite of what was clicked.
 */
export async function approvePriceAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await approvePriceRequest(text(data, "supplyId"));
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/suppliers/prices");
  revalidatePath("/admin/approvals");
  return { ok: true, message: "Price agreed. It applies to new orders only." };
}

export async function rejectPriceAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await rejectPriceRequest(
    text(data, "supplyId"),
    text(data, "note")
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/suppliers/prices");
  revalidatePath("/admin/approvals");
  return { ok: true, message: "Declined. The agreed price is unchanged." };
}
