"use server";

import { revalidatePath } from "next/cache";
import { approveChange, rejectChange } from "@/lib/account-changes";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function refresh() {
  revalidatePath("/admin/approvals");
  revalidatePath("/admin");
  // The customer is watching their own copy of this.
  revalidatePath("/account/changes");
  revalidatePath("/account/branches");
}

export async function approveChangeAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await approveChange(text(data, "changeId"), text(data, "note"));
  if (result.ok) refresh();
  return result.ok
    ? { ok: true, message: "Approved and applied to the account." }
    : { ok: false, error: result.error };
}

export async function rejectChangeAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await rejectChange(text(data, "changeId"), text(data, "note"));
  if (result.ok) refresh();
  return result.ok
    ? { ok: true, message: "Turned down. The customer can see your reason." }
    : { ok: false, error: result.error };
}
