"use server";

import { revalidatePath } from "next/cache";
import {
  addOption,
  addValue,
  removeOption,
  removeValue,
  setSkuOptionValues,
} from "@/lib/product-options";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/**
 * The storefront builds its picker from these, so the shop pages are
 * revalidated too — not only the admin screen the change happened on. A new
 * colour that appears in the admin and not in the picker is a change that
 * looks like it failed.
 */
function refresh(productId: string, slug: string) {
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/products");
  if (slug) revalidatePath(`/products/${slug}`);
}

export async function addOptionAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await addOption(text(data, "productId"), text(data, "name"));
  if (!result.ok) return { ok: false, error: result.error };

  refresh(text(data, "productId"), text(data, "slug"));
  return { ok: true, message: "Option added." };
}

export async function removeOptionAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await removeOption(text(data, "optionId"));
  if (!result.ok) return { ok: false, error: result.error };

  refresh(text(data, "productId"), text(data, "slug"));
  return { ok: true, message: "Option removed." };
}

export async function addValueAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await addValue(text(data, "optionId"), text(data, "value"));
  if (!result.ok) return { ok: false, error: result.error };

  refresh(text(data, "productId"), text(data, "slug"));

  /*
   * A new value has nothing to sell yet, so the page opens a pack form on it.
   *
   * Adding "Purple" creates the answer and no pack that IS purple — the screen
   * gained a chip and nothing to type a price into, which is not what anybody
   * means by adding a variant. Carried in the URL rather than in component
   * state: the form is on a different card from the button that was pressed,
   * and threading it through would be two components sharing a secret. This
   * way the back button also works, and a half-finished pack survives a
   * refresh.
   */
  return { ok: true, message: "Variant added. Its pack form is ready.", newVariantId: result.value };
}

export async function removeValueAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await removeValue(text(data, "valueId"));
  if (!result.ok) return { ok: false, error: result.error };

  refresh(text(data, "productId"), text(data, "slug"));
  return { ok: true, message: "Removed." };
}

export async function assignValueToSkuAction(
  skuId: string,
  valueIds: string[]
): Promise<void> {
  await setSkuOptionValues(skuId, valueIds);
}

export async function setSkuOptionsAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  // One value per option, posted under the same name. Empty entries mean
  // "this pack does not answer that question" and are dropped by the service.
  const valueIds = data.getAll("valueId").map(String).filter(Boolean);

  const result = await setSkuOptionValues(text(data, "skuId"), valueIds);
  if (!result.ok) return { ok: false, error: result.error };

  refresh(text(data, "productId"), text(data, "slug"));
  return { ok: true, message: "Saved." };
}
