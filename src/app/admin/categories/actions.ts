"use server";

import { revalidatePath } from "next/cache";
import { createCategory, renameCategory } from "@/lib/admin";
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
