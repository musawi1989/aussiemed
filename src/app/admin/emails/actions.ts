"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { deliver } from "@/lib/mailer";
import { draftFromTemplate, sendComposed } from "@/lib/compose";
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

export async function draftAction(input: {
  templateId: string;
  reference?: string | null;
}): Promise<{ subject: string; body: string } | { error: string }> {
  const result = await draftFromTemplate(input);
  return result.ok ? result.value : { error: result.error };
}

export async function sendComposedAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const to = String(data.get("to") ?? "").trim();
  const subject = String(data.get("subject") ?? "");
  const body = String(data.get("body") ?? "");

  const result = await sendComposed({
    to,
    audience: data.get("audience") === "Supplier" ? "Supplier" : "Customer",
    subject,
    body,
  });

  if (!result.ok) {
    // Hand the wording back. Being refused for a customer's name in a
    // supplier email means editing one line, not retyping the message.
    return { ok: false, error: result.error, values: { to, subject, body } };
  }

  revalidatePath("/admin/emails");
  return { ok: true, message: `Sent to ${to}.` };
}
