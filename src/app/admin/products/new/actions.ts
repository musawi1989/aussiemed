"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createProduct } from "@/lib/admin";
import type { FormState } from "@/components/AdminForm";

/**
 * Thin on purpose: read the form, hand it to the service layer, translate the
 * Result. Every rule lives in src/lib/admin.ts, because a server action is a
 * public endpoint and the UI is not what protects it.
 */

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const num = (data: FormData, key: string) => Number(data.get(key) ?? 0);

export async function createProductAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await createProduct({
    name: text(data, "name"),
    description: text(data, "description") || null,
    brandId: text(data, "brandId") || null,
    taxClass: text(data, "taxClass"),
    variantGroup: text(data, "variantGroup") || null,
    variantLabel: text(data, "variantLabel") || null,
    categoryIds: data.getAll("categoryIds").map(String).filter(Boolean),
    skuCode: text(data, "skuCode"),
    unitLabel: text(data, "unitLabel"),
    unitShortLabel: text(data, "unitShortLabel"),
    baseUnitName: text(data, "baseUnitName"),
    eachesPerPack: num(data, "eachesPerPack"),
    priceAED: num(data, "priceAED"),
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/products");

  // Straight to the product that was just made, because the next thing anybody
  // does is add a photograph and a second pack size, and both live there. A
  // success message on an empty form would leave them hunting for it.
  redirect(`/admin/products/${result.value.id}?created=1`);
}
