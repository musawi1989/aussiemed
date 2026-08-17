"use server";

import { revalidatePath } from "next/cache";
import {
  addProductImage,
  removeProductImage,
  replaceTiers,
  setPrimaryProductImage,
  setProductStatus,
  updateProduct,
  updateSku,
  type Result,
} from "@/lib/admin";
import type { FormState } from "@/components/AdminForm";

/**
 * Server actions for the product edit screen.
 *
 * These are thin on purpose: read the form, hand it to the service layer,
 * translate the Result into something the form can render. Every rule that
 * matters lives in src/lib/admin.ts, because a server action is a public
 * endpoint and the UI is not what protects it.
 */

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const num = (data: FormData, key: string) => Number(data.get(key) ?? 0);
const bool = (data: FormData, key: string) => data.get(key) === "1";

/** The last value wins: an unchecked box posts "0" before the checkbox's "1". */
const checked = (data: FormData, key: string) =>
  data.getAll(key).at(-1) === "1";

function toState(result: Result<unknown>, message: string): FormState {
  return result.ok ? { ok: true, message } : { ok: false, error: result.error };
}

export async function saveProductAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const id = text(data, "id");

  const result = await updateProduct(id, {
    name: text(data, "name"),
    description: text(data, "description") || null,
    brandId: text(data, "brandId") || null,
    taxClass: text(data, "taxClass"),
    variantGroup: text(data, "variantGroup") || null,
    variantLabel: text(data, "variantLabel") || null,
    categoryIds: data.getAll("categoryIds").map(String).filter(Boolean),
  });

  if (result.ok) {
    revalidatePath(`/admin/products/${id}`);
    revalidatePath("/admin/products");
  }
  return toState(result, "Product saved.");
}

export async function setStatusAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const id = text(data, "id");
  const status = text(data, "status");

  const result = await setProductStatus(id, status);
  if (result.ok) {
    revalidatePath(`/admin/products/${id}`);
    revalidatePath("/admin/products");
  }
  return toState(
    result,
    status === "Active" ? "Product approved and live." : `Moved to ${status}.`
  );
}

export async function saveSkuAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const skuId = text(data, "skuId");
  const productId = text(data, "productId");

  const result = await updateSku(skuId, {
    skuCode: text(data, "skuCode"),
    baseUnitName: text(data, "baseUnitName"),
    unitLabel: text(data, "unitLabel"),
    unitShortLabel: text(data, "unitShortLabel"),
    eachesPerPack: num(data, "eachesPerPack"),
    priceAED: num(data, "priceAED"),
    manualOutOfStock: checked(data, "manualOutOfStock"),
    isActive: checked(data, "isActive"),
  });

  if (result.ok) revalidatePath(`/admin/products/${productId}`);
  return toState(result, "SKU saved.");
}

/* ------------------------------------------------------------------ *
 * Images — BE-29
 * ------------------------------------------------------------------ */

/**
 * The storefront reads images through the cached catalogue, so both the
 * product page and every grid the product appears in have to be revalidated,
 * not just the admin screen the upload happened on.
 */
function revalidateProduct(productId: string, slug: string | null) {
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  revalidatePath("/products");
  if (slug) revalidatePath(`/products/${slug}`);
}

export async function uploadImageAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const productId = text(data, "productId");
  const slug = text(data, "slug") || null;
  const file = data.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image file first." };
  }

  // Read once, here, so the service layer works in bytes and never has to know
  // this arrived over HTTP as multipart form data.
  const bytes = Buffer.from(await file.arrayBuffer());

  const result = await addProductImage(productId, bytes, text(data, "altText") || null);
  if (result.ok) revalidateProduct(productId, slug);
  return toState(result, "Image added.");
}

export async function removeImageAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const productId = text(data, "productId");
  const result = await removeProductImage(text(data, "imageId"));
  if (result.ok) revalidateProduct(productId, text(data, "slug") || null);
  return toState(result, "Image removed.");
}

export async function makePrimaryImageAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const productId = text(data, "productId");
  const result = await setPrimaryProductImage(text(data, "imageId"));
  if (result.ok) revalidateProduct(productId, text(data, "slug") || null);
  return toState(result, "That is now the image the catalogue shows.");
}

/**
 * Price breaks post as parallel arrays — one row is a quantity, a price, a
 * level name and how many of the level below make it. A row with no quantity
 * is a blank the admin left alone, not a deletion.
 */
export async function saveTiersAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const skuId = text(data, "skuId");
  const productId = text(data, "productId");

  const minQtys = data.getAll("tierMinQty").map(String);
  const prices = data.getAll("tierPrice").map(String);
  const names = data.getAll("tierUnitName").map(String);
  const perLevels = data.getAll("tierUnitsPerLevel").map(String);

  const tiers = minQtys
    // Drop blank rows before parsing, so an empty box the admin never filled
    // in does not become a break at quantity 0.
    .map((minQty, i) => ({ minQty: minQty.trim(), index: i }))
    .filter((row) => row.minQty !== "")
    .map(({ minQty, index }) => ({
      minQty: Number(minQty),
      priceAED: Number(prices[index]),
      unitName: (names[index] ?? "").trim() || null,
      unitsPerLevel: (perLevels[index] ?? "").trim()
        ? Number(perLevels[index])
        : null,
    }));

  const result = await replaceTiers(skuId, tiers);
  if (result.ok) revalidatePath(`/admin/products/${productId}`);
  return toState(
    result,
    tiers.length === 0 ? "Price breaks cleared." : "Price breaks saved."
  );
}
