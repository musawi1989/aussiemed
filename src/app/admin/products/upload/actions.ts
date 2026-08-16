"use server";

import { revalidatePath } from "next/cache";
import { importCatalogue } from "@/lib/catalogue-import";
import type { RowError } from "@/lib/catalogue-template";

export type ImportState =
  | null
  | { ok: false; error: string }
  | {
      ok: true;
      message: string;
      errors: RowError[];
    };

export async function uploadCatalogueAction(
  _state: ImportState,
  data: FormData
): Promise<ImportState> {
  const file = data.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a spreadsheet first." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await importCatalogue(file.name, bytes);

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/products");
  revalidatePath("/admin/products/upload");
  revalidatePath("/products");

  const o = result.value;
  const loaded = o.skusCreated + o.skusUpdated;

  return {
    ok: true,
    message:
      `${loaded} of ${o.rowsTotal} row${o.rowsTotal === 1 ? "" : "s"} loaded — ` +
      `${o.productsCreated} new product${o.productsCreated === 1 ? "" : "s"}, ` +
      `${o.skusCreated} new pack${o.skusCreated === 1 ? "" : "s"}, ` +
      `${o.skusUpdated} updated` +
      (o.errors.length > 0
        ? `. ${o.errors.length} row${o.errors.length === 1 ? "" : "s"} could not be read.`
        : "."),
    errors: o.errors,
  };
}
