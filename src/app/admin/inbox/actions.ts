"use server";

import { revalidatePath } from "next/cache";
import {
  emailNotification,
  markAllRead,
  markRead,
} from "@/lib/notifications";
import { emailInvoice } from "@/lib/invoice-email";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function refresh() {
  revalidatePath("/admin/inbox");
  revalidatePath("/admin", "layout");
}

export async function markReadAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  await markRead(text(data, "id"), data.get("read") === "yes");
  refresh();
  return { ok: true };
}

export async function markAllReadAction(
  _state: FormState,
  _data: FormData
): Promise<FormState> {
  const result = await markAllRead();
  refresh();
  return result.ok
    ? { ok: true, message: `${result.value} marked read.` }
    : { ok: false, error: result.error };
}

export async function emailNotificationAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const to = text(data, "to");
  const result = await emailNotification(text(data, "id"), to, text(data, "note"));

  if (!result.ok) {
    // Hand back what was typed: React clears the form when the action returns,
    // and losing a carefully written note to a typo in the address is the kind
    // of thing that stops a feature being used.
    return {
      ok: false,
      error: result.error,
      values: { to, note: text(data, "note") },
    };
  }

  refresh();
  revalidatePath("/admin/emails");
  return { ok: true, message: `Sent to ${to}.` };
}

export async function emailInvoiceAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const to = text(data, "to");
  const result = await emailInvoice(text(data, "reference"), to);

  if (!result.ok) return { ok: false, error: result.error, values: { to } };

  revalidatePath(`/admin/orders/${text(data, "reference")}`);
  revalidatePath("/admin/emails");
  return {
    ok: true,
    message:
      result.value.status === "Duplicate"
        ? `Already sent to ${result.value.to} — nothing sent again.`
        : `Invoice sent to ${result.value.to}.`,
  };
}
