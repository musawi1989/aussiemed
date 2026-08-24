"use server";

import { revalidatePath } from "next/cache";
import {
  addBranch,
  addPerson,
  editBranch,
  editPerson,
  removeAgreedPrice,
  removeBranch,
  removePerson,
  setAccountTerms,
  setAgreedPrice,
  type BranchInput,
} from "@/lib/customer-admin";
import type { FormState } from "@/components/AdminForm";

/**
 * The customer account's commercial terms, branches and people.
 *
 * Separate from actions.ts, which owns the account's own details. These are
 * eight small intents against one record rather than one form, and each posts
 * its own — a mis-click on Remove must not be able to save a discount, and a
 * refused price must land against the price form rather than at the top of the
 * page.
 *
 * Every one of them reads the account id from the form. That is safe because
 * every function it calls requires an admin and scopes its lookups to that
 * account — an id from elsewhere finds nothing rather than another customer's
 * branch. The scoping lives in customer-admin.ts, stated at each query.
 */

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/** Where a change to this account has to become visible. */
function refresh(id: string) {
  revalidatePath(`/admin/customers/${id}`);
  revalidatePath("/admin/customers");
}

/** Every action here ends the same way, so it is written once. */
async function run(
  id: string,
  message: string,
  work: () => Promise<{ ok: boolean; error?: string }>
): Promise<FormState> {
  if (!id) return { ok: false, error: "That account no longer exists." };

  const result = await work();
  if (!result.ok) return { ok: false, error: result.error ?? "That did not work." };

  refresh(id);
  return { ok: true, message };
}

/* ---------------- terms ---------------- */

export async function setAccountTermsAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const id = text(data, "id");
  return run(id, "Terms saved.", () =>
    setAccountTerms(id, {
      discountPercent: text(data, "discountPercent"),
      paymentTerms: text(data, "paymentTerms"),
    })
  );
}

/* ---------------- agreed prices ---------------- */

export async function setAgreedPriceAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const id = text(data, "id");
  return run(id, "Price agreed.", () =>
    setAgreedPrice(id, {
      skuCode: text(data, "skuCode"),
      price: text(data, "price"),
      note: text(data, "note"),
    })
  );
}

export async function removeAgreedPriceAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const id = text(data, "id");
  return run(id, "Price removed.", () => removeAgreedPrice(id, text(data, "priceId")));
}

/* ---------------- branches ---------------- */

/** The nine address fields, read the same way whether adding or editing. */
function branchFrom(data: FormData): BranchInput {
  return {
    label: text(data, "label"),
    contact: text(data, "contact"),
    phone: text(data, "phone"),
    line1: text(data, "line1"),
    line2: text(data, "line2"),
    city: text(data, "city"),
    emirate: text(data, "emirate"),
    countryCode: text(data, "countryCode") || "AE",
    country: text(data, "country") || "United Arab Emirates",
  };
}

export async function addBranchAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const id = text(data, "id");
  return run(id, "Branch added.", () => addBranch(id, branchFrom(data)));
}

export async function editBranchAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const id = text(data, "id");
  return run(id, "Branch saved.", () =>
    editBranch(id, text(data, "branchId"), branchFrom(data))
  );
}

export async function removeBranchAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const id = text(data, "id");
  return run(id, "Branch removed.", () => removeBranch(id, text(data, "branchId")));
}

/* ---------------- people who order ---------------- */

export async function addPersonAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const id = text(data, "id");
  return run(id, "Person added.", () =>
    addPerson(id, { name: text(data, "name"), addressId: text(data, "addressId") })
  );
}

export async function editPersonAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const id = text(data, "id");
  return run(id, "Person saved.", () =>
    editPerson(id, text(data, "personId"), {
      name: text(data, "name"),
      addressId: text(data, "addressId"),
    })
  );
}

export async function removePersonAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const id = text(data, "id");
  return run(id, "Person removed.", () => removePerson(id, text(data, "personId")));
}
