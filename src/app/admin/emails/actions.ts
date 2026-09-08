"use server";

import { revalidatePath } from "next/cache";
import { audit, requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { safeEmailHtml } from "@/lib/email-html";
import { deliver } from "@/lib/mailer";
import { draftFromTemplate, sendComposed } from "@/lib/compose";
import type { FormState } from "@/components/AdminForm";

export async function retryEmailAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  await requireAdmin("email");

  const result = await deliver(String(data.get("id") ?? ""));
  revalidatePath("/admin/emails");

  return result.status === "Sent"
    ? { ok: true, message: "Sent." }
    : { ok: false, error: result.error ?? "Could not send it." };
}

export async function draftAction(input: {
  templateId: string;
  reference?: string | null;
}): Promise<{ subject: string; body: string; html?: string } | { error: string }> {
  const result = await draftFromTemplate(input);
  return result.ok ? result.value : { error: result.error };
}

export async function sendComposedAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  await requireAdmin("email");
  const to = String(data.get("to") ?? "").trim();
  const subject = String(data.get("subject") ?? "");
  const body = String(data.get("body") ?? "");
  const html = String(data.get("html") ?? "");
  const files = data.getAll("attachments").filter((file): file is File => file instanceof File && file.size > 0);
  if (files.length > 5 || files.reduce((size, file) => size + file.size, 0) > 10 * 1024 * 1024) return { ok: false, error: "Attach up to five files, totalling 10 MB or less." };
  const attachments = [];
  for (const file of files) attachments.push({ fileName: file.name, contentType: file.type || "application/octet-stream", bytes: new Uint8Array(await file.arrayBuffer()) });

  const result = await sendComposed({
    to,
    audience: data.get("audience") === "Supplier" ? "Supplier" : "Customer",
    subject,
    body,
    html,
    attachments,
  });

  if (!result.ok) {
    // Hand the wording back. Being refused for a customer's name in a
    // supplier email means editing one line, not retyping the message.
    return { ok: false, error: result.error, values: { to, subject, body, html } };
  }

  revalidatePath("/admin/emails");
  return { ok: true, message: `Sent to ${to}.` };
}

export async function saveSignatureAction(_state: FormState, data: FormData): Promise<FormState> {
  const actor = await requireAdmin("email");
  const html = String(data.get("emailSignatureHtml") ?? "");
  if (html.length > 20000) return { ok: false, error: "Keep your signature under 20,000 characters." };
  const before = await db.user.findUnique({ where: { id: actor.id }, select: { emailSignatureHtml: true } });
  const after = { emailSignatureHtml: safeEmailHtml(html) || null };
  await db.user.update({ where: { id: actor.id }, data: after });
  await audit(actor, "email.signature.update", "User", actor.id, before, after);
  revalidatePath("/admin/emails");
  return { ok: true, message: "Signature saved." };
}
