"use server";

import { revalidatePath } from "next/cache";
import {
  createSavedTemplate,
  deleteSavedTemplate,
  updateSavedTemplate,
} from "@/lib/saved-templates";
import { unknownPlaceholders } from "@/lib/email-templates";
import { PLACEHOLDERS } from "@/lib/saved-templates";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function read(data: FormData) {
  const audience: "Customer" | "Supplier" =
    data.get("audience") === "Supplier" ? "Supplier" : "Customer";
  return {
    name: text(data, "name"),
    audience,
    subject: text(data, "subject"),
    body: String(data.get("body") ?? "").trim(),
    html: String(data.get("html") ?? ""),
    needsOrder: data.getAll("needsOrder").at(-1) === "1",
  };
}

/**
 * Saved, then warned about.
 *
 * A placeholder nothing will fill is worth saying and not worth refusing over:
 * somebody drafting a customer template may reasonably type a supplier key
 * while thinking, and blocking the save loses the paragraph they had written.
 * The message names the keys so the fix is obvious.
 */
function withWarning(
  message: string,
  input: ReturnType<typeof read>
): FormState {
  const known = PLACEHOLDERS[input.audience].map((p) => p.key);
  const unknown = unknownPlaceholders(
    `${input.subject}\n${input.body}`,
    known
  );

  return {
    ok: true,
    message:
      unknown.length === 0
        ? message
        : `${message} Nothing will fill ${unknown.map((u) => `{{${u}}}`).join(", ")} — those will go out as typed.`,
  };
}

export async function createTemplateAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const input = read(data);
  const result = await createSavedTemplate(input);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/emails");
  return withWarning("Template saved.", input);
}

export async function updateTemplateAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const input = read(data);
  const result = await updateSavedTemplate(text(data, "id"), input);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/emails");
  return withWarning("Template updated.", input);
}

export async function deleteTemplateAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await deleteSavedTemplate(text(data, "id"));
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/emails");
  return { ok: true, message: "Template deleted." };
}
