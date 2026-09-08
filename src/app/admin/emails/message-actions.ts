"use server";

import { revalidatePath } from "next/cache";
import { deleteTemplate, saveTemplate } from "@/lib/message-templates";
import type { FormState } from "@/components/AdminForm";

/**
 * Thin, like every other actions file. The rules — such as they are — live in
 * src/lib/message-templates.ts, because a server action is a public endpoint.
 */

export async function saveMessageTemplateAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const kind = String(data.get("kind") ?? "").trim();
  const subject = String(data.get("subject") ?? "");
  const body = String(data.get("body") ?? "");

  // Echoed back so a refusal does not discard a rewritten email.
  const values = { subject, body };

  const result = await saveTemplate({
    kind,
    subject,
    body,
    html: String(data.get("html") ?? ""),
    isActive: data.get("isActive") !== null,
  });
  if (!result.ok) return { ok: false, error: result.error, values };

  revalidatePath("/admin/emails/messages");
  return {
    ok: true,
    message:
      data.get("isActive") !== null
        ? "Saved. This wording goes out from now on."
        : "Saved, but switched off — the built-in wording is still what sends.",
  };
}

export async function deleteMessageTemplateAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await deleteTemplate(String(data.get("kind") ?? "").trim());
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/emails/messages");
  return { ok: true, message: "Removed. The built-in wording is back." };
}
