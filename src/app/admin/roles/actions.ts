"use server";

import { revalidatePath } from "next/cache";
import {
  resetSupplierPermissions,
  setSupplierPermission,
} from "@/lib/permissions";
import type { FormState } from "@/components/AdminForm";

/**
 * Changing a permission changes what the supplier portal renders, so both
 * sides are revalidated. Missing the portal here would leave a supplier
 * looking at a button that no longer works until something else happened to
 * rebuild the page.
 */
function refresh() {
  revalidatePath("/admin/roles");
  revalidatePath("/business-portal");
  revalidatePath("/business-portal/supplies");
  revalidatePath("/business-portal/supplies/add");
}

export async function setPermissionAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const key = String(data.get("key") ?? "");
  const mode = String(data.get("mode") ?? "");

  const result = await setSupplierPermission(key, mode);
  if (!result.ok) return { ok: false, error: result.error };

  refresh();
  return { ok: true, message: "Saved." };
}

export async function resetPermissionsAction(
  _state: FormState,
  _data: FormData
): Promise<FormState> {
  const result = await resetSupplierPermissions();
  if (!result.ok) return { ok: false, error: result.error };

  refresh();
  return {
    ok: true,
    message:
      result.value === 0
        ? "Nothing to put back — everything was already as it shipped."
        : `${result.value} ${result.value === 1 ? "permission" : "permissions"} put back to how it shipped.`,
  };
}
