"use server";
import { canEditOwnLogo } from "./logo-access";
import { db } from "./db";
import { getSessionUser } from "./auth";
import { requireAdmin, audit } from "./admin";
import { putProductImage, MAX_IMAGE_BYTES } from "./storage";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/AdminForm";
export async function saveLogo(_state: FormState, data: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in to change your logo." };
  const kind = String(data.get("kind")); const id = String(data.get("id"));
  if (!["supplier", "organisation", "user"].includes(kind)) return { ok: false, error: "Invalid profile." };
  if (user.role === "Admin") await requireAdmin(kind === "supplier" ? "suppliers" : "customers");
  else if (!canEditOwnLogo(user, kind, id)) return { ok: false, error: "You can only change your own logo." };
  const existing = kind === "supplier" ? await db.supplier.findUnique({ where: { id } }) : kind === "organisation" ? await db.organisation.findUnique({ where: { id } }) : await db.user.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "That profile no longer exists." };
  let logoPath: string | null = null;
  if (data.get("remove") !== "true") {
    const file = data.get("logo");
    if (!(file instanceof File) || !file.size || file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Choose a PNG, JPEG or WebP image up to 5 MB." };
    const stored = await putProductImage(Buffer.from(await file.arrayBuffer()), `logo-${kind}-${id}`);
    if (!stored.ok) return { ok: false, error: stored.error };
    logoPath = stored.url;
  }
  if (kind === "supplier") await db.supplier.update({ where: { id }, data: { logoPath } });
  else if (kind === "organisation") await db.organisation.update({ where: { id }, data: { logoPath } });
  else await db.user.update({ where: { id }, data: { logoPath } });
  await audit(user, "profile.logo", kind, id, { logoPath: existing.logoPath }, { logoPath });
  revalidatePath("/", "layout");
  return { ok: true, message: logoPath ? "Logo saved." : "Logo removed." };
}
