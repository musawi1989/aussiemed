"use server";

import { revalidatePath } from "next/cache";
import { addressPartsFrom } from "@/lib/geo";
import { createSupplier, updateSupplier, type SupplierEdit } from "@/lib/admin";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function read(data: FormData): SupplierEdit {
  const where = addressPartsFrom(data);
  return {
    companyName: text(data, "companyName"),
    primaryEmail: text(data, "primaryEmail"),
    secondaryEmail: text(data, "secondaryEmail"),
    phone: where.phone || null,
    countryCode: where.countryCode,
    emirate: where.emirate || null,
    address: text(data, "address") || null,
    trn: text(data, "trn") || null,
    status: text(data, "status") || "Active",
    // Blank stays blank: not agreed is a real answer, and the service layer
    // reads it as one rather than as a target of zero.
    promisedLeadTimeDays: text(data, "promisedLeadTimeDays") || null,
    ackSlaHours: text(data, "ackSlaHours") || null,
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
