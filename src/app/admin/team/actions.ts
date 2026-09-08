"use server";

import { revalidatePath } from "next/cache";
import {
  createAdmin,
  resetAdminPassword,
  setAdminDisabled,
  setAdminPermissions,
  setMasterAdmin,
} from "@/lib/admin-team";
import type { FormState } from "@/components/AdminForm";

/**
 * Thin, like every other actions file. Every rule that matters — who may do
 * this, and what would leave the system without a master admin — lives in
 * src/lib/admin-team.ts, because a server action is a public endpoint and this
 * is the one screen where that is not a theoretical concern.
 */

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export async function createAdminAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  // Echoed back so a refusal does not empty the form. Never the password.
  const values = {
    name: text(data, "name"),
    username: text(data, "username"),
    email: text(data, "email"),
  };

  const result = await createAdmin({
    ...values,
    password: String(data.get("password") ?? ""),
    isMasterAdmin: data.get("isMasterAdmin") !== null,
  });
  if (!result.ok) return { ok: false, error: result.error, values };

  revalidatePath("/admin/team");
  return {
    ok: true,
    message: `${values.name} can now sign in as "${values.username}".`,
  };
}

export async function setPermissionsAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  /*
   * Unticked boxes post nothing, so the denials are whatever the form OFFERED
   * and the person did not tick.
   *
   * Read from the offered list rather than from the catalogue, so a permission
   * added between rendering this form and submitting it is not silently denied
   * to somebody — the form could not have shown a box for it, and its absence
   * is not a decision anybody made.
   */
  const offered = data.getAll("offered").map(String);
  const allowed = new Set(data.getAll("allow").map(String));
  const denied = offered.filter((key) => !allowed.has(key));

  const result = await setAdminPermissions(text(data, "userId"), denied);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/team");
  const n = result.value.denied.length;
  return {
    ok: true,
    message:
      n === 0
        ? "Saved — they can reach everything."
        : `Saved — ${n} section${n === 1 ? "" : "s"} switched off.`,
  };
}

export async function setMasterAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await setMasterAdmin(
    text(data, "userId"),
    data.get("makeMaster") !== null
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/team");
  return { ok: true, message: "Saved." };
}

export async function setDisabledAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const disable = data.get("disable") !== null;
  const result = await setAdminDisabled(text(data, "userId"), disable);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/team");
  return { ok: true, message: disable ? "Signed out and disabled." : "Enabled." };
}

export async function resetPasswordAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await resetAdminPassword(
    text(data, "userId"),
    String(data.get("password") ?? "")
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/team");
  return {
    ok: true,
    message: "Password changed. Every session they had is now signed out.",
  };
}
