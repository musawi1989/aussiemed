"use server";
import { revalidatePath } from "next/cache";
import { createBrand, setBrandActive } from "@/lib/brands";
import type { FormState } from "@/components/AdminForm";
export async function createBrandAction(_state: FormState, data: FormData): Promise<FormState> {
  const result = await createBrand(String(data.get("name") ?? ""));
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/products", "layout");
  return { ok: true, message: "Brand created." };
}
export async function setBrandActiveAction(_state: FormState, data: FormData): Promise<FormState> {
  const active = data.get("isActive") === "1";
  const result = await setBrandActive(String(data.get("id") ?? ""), active);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/products", "layout");
  return { ok: true, message: active ? "Brand restored." : "Brand removed from new-product choices. Existing products keep their brand." };
}
