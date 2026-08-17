"use server";

import { revalidatePath } from "next/cache";
import { decideApplication } from "@/lib/applications";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export async function decideApplicationAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const approve = text(data, "decision") === "approve";
  const result = await decideApplication({
    userId: text(data, "userId"),
    approve,
    reason: text(data, "reason") || null,
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/applications");
  revalidatePath("/admin/customers");
  return {
    ok: true,
    message: approve
      ? `Approved. ${result.value.email} has been told they can order.`
      : `Turned down. ${result.value.email} has been told why.`,
  };
}
