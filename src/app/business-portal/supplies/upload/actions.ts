"use server";

import { revalidatePath } from "next/cache";
import { applySupplyUpload, listMySupplies, myCompany } from "@/lib/supplier-portal";
import { buildSupplyWorkbook, readSupplyWorkbook } from "@/lib/supply-workbook";
import type { RowProblem } from "@/lib/supply-terms";

export type UploadState =
  | null
  | { ok: false; error: string }
  | {
      ok: true;
      updated: number;
      problems: RowProblem[];
      notSupplied: string[];
    };

/** Twelve megabytes of price list would be a mistake, not a price list. */
const MAX_BYTES = 4 * 1024 * 1024;

export async function uploadSuppliesAction(
  _state: UploadState,
  data: FormData
): Promise<UploadState> {
  const file = data.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file first." };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. A price list should be well under ${MAX_BYTES / 1024 / 1024} MB — check it is the right file.`,
    };
  }

  const sheet = await readSupplyWorkbook(
    Buffer.from(await file.arrayBuffer())
  );
  if (!sheet.ok) return { ok: false, error: sheet.error };

  const result = await applySupplyUpload(sheet.cells);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/business-portal/supplies");
  return {
    ok: true,
    updated: result.value.updated,
    problems: result.value.problems,
    notSupplied: result.value.notSupplied,
  };
}

/**
 * The template, filled in with what we currently hold for them.
 *
 * Returned as a base64 string rather than a download route because it is built
 * from the session's own supplier — a URL anyone could fetch would be a URL
 * that needs its own guard, and this needs none.
 */
export async function supplyTemplateAction(): Promise<{
  fileName: string;
  base64: string;
}> {
  const [supplies, company] = await Promise.all([listMySupplies(), myCompany()]);

  const workbook = await buildSupplyWorkbook(
    company?.companyName ?? "your company",
    supplies.map((supply) => ({
      skuCode: supply.skuCode,
      productName: supply.productName,
      unitLabel: supply.unitLabel,
      supplierPartNumber: supply.supplierPartNumber,
      costFils: supply.costFils,
      leadTimeDays: supply.leadTimeDays,
      isAvailable: supply.isAvailable,
    }))
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    fileName: `aussiemed-prices-${stamp}.xlsx`,
    base64: workbook.toString("base64"),
  };
}
