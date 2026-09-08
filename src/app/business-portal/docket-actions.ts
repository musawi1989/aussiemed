"use server";
import { revalidatePath } from "next/cache";
import { updateDocket } from "@/lib/docket-updates";
import type { FormState } from "@/components/AdminForm";

export async function updateDocketAction(_state: FormState, data: FormData): Promise<FormState> {
  const text = (key: string) => String(data.get(key) ?? "").trim();
  const ids = data.getAll("docketLineId").map(String);
  const quantities = data.getAll("docketQty").map(value => Number(String(value).trim() || "0"));
  const result = await updateDocket({ id: text("id"), lines: ids.map((purchaseOrderLineId, index) => ({ purchaseOrderLineId, qty: quantities[index] })),
    courier: text("courier"), trackingNumber: text("trackingNumber"), note: text("note"),
    dispatched: text("dispatched") === "1", reason: text("reason"),
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/purchasing", "layout");
  revalidatePath("/admin/suppliers", "layout");
  revalidatePath("/business-portal", "layout");
  return { ok: true, message: "Docket updated." };
}
