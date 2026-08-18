"use server";

import { revalidatePath } from "next/cache";
import { createOrganisation, updateOrganisation } from "@/lib/admin";
import { addressPartsFrom } from "@/lib/geo";
import type { OrganisationInput } from "@/lib/organisation";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function read(data: FormData): OrganisationInput {
  // The country, region and phone all come out of one picker, so a number
  // typed nationally is stored with the dialling code its country implies.
  const where = addressPartsFrom(data);

  return {
    name: text(data, "name"),
    trn: text(data, "trn") || null,
    phone: where.phone || null,
    countryCode: where.countryCode,
    emirate: where.emirate || null,
    notes: text(data, "notes") || null,
    // The hidden "0" posts before the box's "1", so the last value wins.
    isDisabled: data.getAll("isDisabled").at(-1) === "1",
  };
}

export async function createCustomerAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await createOrganisation(read(data));
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/customers");
  return { ok: true, message: "Account opened." };
}

export async function updateCustomerAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const id = text(data, "id");
  const result = await updateOrganisation(id, read(data), text(data, "reason"));
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers");
  return { ok: true, message: "Account saved." };
}
