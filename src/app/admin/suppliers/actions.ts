"use server";

import { revalidatePath } from "next/cache";
import { createSupplier, updateSupplier, type SupplierEdit } from "@/lib/admin";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function read(data: FormData): SupplierEdit {
  return {
    companyName: text(data, "companyName"),
    primaryEmail: text(data, "primaryEmail"),
    secondaryEmail: text(data, "secondaryEmail"),
    phone: text(data, "phone") || null,
    address: text(data, "address") || null,
    trn: text(data, "trn") || null,
    status: text(data, "status") || "Active",
  };
}

export async function createSupplierAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await createSupplier(read(data));
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/suppliers");
  return { ok: true, message: "Supplier created." };
}

export async function updateSupplierAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const id = text(data, "id");
  const result = await updateSupplier(id, read(data));
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/suppliers/${id}`);
  revalidatePath("/admin/suppliers");
  return { ok: true, message: "Supplier saved." };
}
