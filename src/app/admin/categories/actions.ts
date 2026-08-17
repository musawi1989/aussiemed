"use server";

import { revalidatePath } from "next/cache";
import {
  createCategory,
  deleteCategory,
  deleteEmptyCategories,
  renameCategory,
} from "@/lib/admin";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export async function createCategoryAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await createCategory(
    text(data, "name"),
    text(data, "parentId") || null
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/categories");
  return { ok: true, message: "Category created." };
}

export async function renameCategoryAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await renameCategory(text(data, "id"), text(data, "name"));
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/categories");
  return { ok: true, message: "Renamed. The URL is unchanged." };
}

export async function deleteCategoryAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await deleteCategory(text(data, "id"));
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/categories");
  return { ok: true, message: `${result.value} removed.` };
}

export async function deleteEmptyCategoriesAction(
  _state: FormState,
  _data: FormData
): Promise<FormState> {
  const result = await deleteEmptyCategories();
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/categories");
  return {
    ok: true,
    message:
      result.value === 0
        ? "Nothing to remove — no category is empty."
        : `${result.value} empty ${result.value === 1 ? "category" : "categories"} removed.`,
  };
}
