"use server";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/AdminForm";
import { recordInvoicePayment, type InvoiceKind } from "@/lib/payment-ledger";

export async function recordPaymentAction(_state: FormState, data: FormData): Promise<FormState> {
  const text = (key: string) => String(data.get(key) ?? "").trim();
  const result = await recordInvoicePayment({
    entity: text("entity") as InvoiceKind, id: text("id"), amount: text("amount"),
    kind: text("kind"), date: text("date"), note: text("note"), requestKey: text("requestKey"),
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin", "layout");
  revalidatePath("/account", "layout");
  revalidatePath("/business-portal", "layout");
  return { ok: true, message: "Payment recorded." };
}
