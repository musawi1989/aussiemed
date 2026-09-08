import "server-only";
import { db } from "./db";
import { audit, requireAdmin, slugify, type Result } from "./admin";
import { invalidateCatalog } from "./catalog";

export async function createBrand(name: string): Promise<Result<string>> {
  const actor = await requireAdmin("products");
  const clean = name.trim();
  const slug = slugify(clean);
  if (!clean || clean.length > 100 || !slug) return { ok: false, error: "Enter a brand name of 1 to 100 characters." };
  const existing = await db.brand.findFirst({ where: { OR: [{ name: clean }, { slug }] } });
  if (existing) return { ok: false, error: "That brand already exists. Restore it if it was removed." };
  try {
    const brand = await db.brand.create({ data: { name: clean, slug } });
    await audit(actor, "brand.create", "Brand", brand.id, null, brand);
    await invalidateCatalog();
    return { ok: true, value: brand.id };
  } catch { return { ok: false, error: "That brand could not be created. Check for a duplicate name." }; }
}

export async function setBrandActive(id: string, isActive: boolean): Promise<Result> {
  const actor = await requireAdmin("products");
  const before = await db.brand.findUnique({ where: { id } });
  if (!before) return { ok: false, error: "That brand no longer exists." };
  if (!isActive && (before.slug === "generic" || before.name.toLowerCase() === "generic")) return { ok: false, error: "Generic is the fallback brand and cannot be removed." };
  await db.brand.update({ where: { id }, data: { isActive } });
  await audit(actor, isActive ? "brand.restore" : "brand.remove", "Brand", id, before, { isActive });
  await invalidateCatalog();
  return { ok: true, value: undefined };
}
