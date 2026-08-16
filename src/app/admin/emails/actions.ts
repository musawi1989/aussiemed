"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { deliver } from "@/lib/mailer";
import type { FormState } from "@/components/AdminForm";

export async function retryEmailAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  await requireAdmin();

  const result = await deliver(String(data.get("id") ?? ""));
  revalidatePath("/admin/emails");

  return result.status === "Sent"
    ? { ok: true, message: "Sent." }
    : { ok: false, error: result.error ?? "Could not send it." };
}
