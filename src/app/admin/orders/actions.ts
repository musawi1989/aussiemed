"use server";

import { revalidatePath } from "next/cache";
import { setOrderStatus } from "@/lib/admin";
import type { FormState } from "@/components/AdminForm";

export async function setOrderStatusAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const reference = String(data.get("reference") ?? "").trim();
  const status = String(data.get("status") ?? "").trim();

  const result = await setOrderStatus(reference, status);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/orders/${reference}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  return { ok: true, message: `Order moved to ${status}.` };
}
