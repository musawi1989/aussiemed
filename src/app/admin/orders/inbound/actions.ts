"use server";
import { revalidatePath } from "next/cache";
import { allocateReceivedGoods } from "@/lib/inbound";
import type { FormState } from "@/components/AdminForm";

export async function allocateGoodsAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await allocateReceivedGoods({
    receiptId: String(data.get("receiptId") ?? ""), orderItemId: String(data.get("orderItemId") ?? ""),
    qty: Number(data.get("qty")), requestKey: String(data.get("requestKey") ?? ""),
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/orders");
  revalidatePath("/admin/received-products");
  return { ok: true, message: "Allocated to the customer order." };
}
