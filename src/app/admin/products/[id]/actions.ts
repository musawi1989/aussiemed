"use server";

import { revalidatePath } from "next/cache";
import {
  addProductDocument,
  addProductImage,
  removeProductDocument,
  removeProductImage,
  replaceTiers,
  setPrimaryProductImage,
  setProductStatus,
  updateProduct,
  updateSku,
  type Result,
} from "@/lib/admin";
import { addPack, removePack } from "@/lib/sku-packs";
import { setSkuOptionValues } from "@/lib/product-options";
import { isRank, RANK_LABELS, setProductCover } from "@/lib/supply-cover";
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

export async function addPackAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const productId = text(data, "productId");

  const result = await addPack(productId, {
    skuCode: text(data, "skuCode"),
    baseUnitName: text(data, "baseUnitName"),
    unitLabel: text(data, "unitLabel"),
    unitShortLabel: text(data, "unitShortLabel"),
    eachesPerPack: num(data, "eachesPerPack"),
    priceAED: num(data, "priceAED"),
    manualOutOfStock: false,
    // Live straight away. A pack created and left invisible is one somebody
    // adds a second time next week because the first never appeared.
    isActive: true,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      // React clears an uncontrolled form when its action returns, so a
      // refusal would otherwise wipe six fields somebody just typed.
      values: {
        skuCode: text(data, "skuCode"),
        baseUnitName: text(data, "baseUnitName"),
        unitLabel: text(data, "unitLabel"),
        unitShortLabel: text(data, "unitShortLabel"),
        eachesPerPack: text(data, "eachesPerPack"),
        priceAED: text(data, "priceAED"),
      },
    };
  }

  /*
   * The variant it was opened for, set on the pack that was just made.
   *
   * Done here rather than inside addPack because a pack does not have to be a
   * variant of anything — most are not — and threading an optional list of
   * option values through the creation path would put a variant concept in
   * front of every product that has none.
   */
  const forValue = text(data, "forValueId");
  if (forValue) await setSkuOptionValues(result.value, [forValue]);

  revalidatePath(`/admin/products/${productId}`);
  return { ok: true, message: "Pack added." };
}

export async function removePackAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await removePack(text(data, "skuId"));
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/products/${text(data, "productId")}`);
  return { ok: true, message: "Pack removed." };
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

  const result = await addProductImage(productId, bytes, text(data, "altText") || null, text(data, "skuId") || null);
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

/* ------------------------------------------------------------------ *
 * Supplier cover
 * ------------------------------------------------------------------ */

/**
 * Set or clear the primary or backup supplier for a whole product.
 *
 * An empty supplierId is a deliberate clear, not a missing field: the select
 * offers "Nobody" as its first option, which is how cover is removed.
 */
export async function setProductCoverAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const productId = text(data, "productId");
  const rank = text(data, "rank");

  if (!isRank(rank)) return { ok: false, error: "That is not a rank." };

  const result = await setProductCover(
    productId,
    rank,
    text(data, "supplierId") || null,
    Object.fromEntries(Array.from(data.entries()).filter(([key]) => key.startsWith("buyingPrice:")).map(([key, value]) => [key.slice(12), String(value).trim() ? Number(value) : NaN]))
  );

  if (!result.ok) return { ok: false, error: result.error };

  revalidateProduct(productId, text(data, "slug") || null);
  revalidatePath("/admin/suppliers/cover");

  const { changed, notOffered, skipped } = result.value;
  const parts = [
    `${RANK_LABELS[rank]} supplier set on ${changed} pack${changed === 1 ? "" : "s"}.`,
  ];

  // Said plainly rather than folded into the count: a pack left uncovered
  // because the supplier does not carry it is the thing worth noticing.
  if (notOffered > 0) {
    parts.push(
      `${notOffered} pack${notOffered === 1 ? " is" : "s are"} not on their list and ${notOffered === 1 ? "was" : "were"} left alone.`
    );
  }
  if (skipped.length > 0) {
    parts.push(`${skipped.length} could not be changed: ${skipped[0].why}`);
  }

  return { ok: true, message: parts.join(" ") };
}

/* ------------------------------------------------------------------ *
 * Documents — DA-13
 * ------------------------------------------------------------------ */

export async function uploadDocumentAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const productId = text(data, "productId");
  const slug = text(data, "slug") || null;
  const file = data.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file first." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // The uploader's own filename is the fallback name, minus its extension. It
  // is usually more informative than anything a hurried admin would type, and
  // "SDS-Nitrile-2026" reads better on a product page than "Document 1".
  const label =
    text(data, "label") || file.name.replace(/\.[^.]+$/, "") || "Document";

  const result = await addProductDocument(
    productId,
    bytes,
    label,
    text(data, "kind") || "Specification"
  );
  if (result.ok) revalidateProduct(productId, slug);
  return toState(result, "Document added.");
}

export async function removeDocumentAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const productId = text(data, "productId");
  const result = await removeProductDocument(text(data, "documentId"));
  if (result.ok) revalidateProduct(productId, text(data, "slug") || null);
  return toState(result, "Document removed.");
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
