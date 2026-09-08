"use server";

import { revalidatePath } from "next/cache";
import {
  addItemToSupplier,
  removeItemFromSupplier,
} from "@/lib/supplier-items";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/**
 * Both screens that show this relationship are redrawn.
 *
 * The supplier page is where the button was pressed; Cover is where the new
 * row becomes a candidate to allocate, and Unallocated is a list of packs with
 * nobody on them that just got one fewer reason to be there.
 */
function refresh(id: string) {
  revalidatePath(`/admin/suppliers/${id}`);
  revalidatePath("/admin/suppliers/cover");
  revalidatePath("/admin/products/unallocated");
}

export async function addSupplierItemAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const supplierId = text(data, "supplierId");

  const result = await addItemToSupplier(supplierId, text(data, "skuId"), {
    costAED: text(data, "costAED"),
    supplierPartNumber: text(data, "supplierPartNumber"),
  });
  if (!result.ok) return { ok: false, error: result.error };

  refresh(supplierId);
  return { ok: true, message: "Added to their list." };
}

export async function removeSupplierItemAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await removeItemFromSupplier(text(data, "supplyId"));
  if (!result.ok) return { ok: false, error: result.error };

  refresh(text(data, "supplierId"));
  return { ok: true, message: "Removed." };
}
