"use server";

import { revalidatePath } from "next/cache";
import { bulkSetCover, isRank, setCover } from "@/lib/supply-cover";
import type { FormState } from "@/components/AdminForm";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/** One pack, one rank. The select on a row posts straight to this. */
export async function setCoverAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const rank = text(data, "rank");
  if (!isRank(rank)) return { ok: false, error: "Unknown rank." };

  // An empty select means "nobody at this rank", which is a real choice and
  // not a missing value.
  const supplierId = text(data, "supplierId") || null;

  const result = await setCover(text(data, "skuId"), rank, supplierId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/suppliers/cover");
  return { ok: true, message: supplierId ? "Saved." : "Cleared." };
}

/**
 * The same change across every ticked pack.
 *
 * Reports what it skipped and why, rather than a bare count. "29 updated, 11
 * skipped" with the reasons is the difference between a bulk action somebody
 * trusts and one they check by hand afterwards anyway.
 */
export async function bulkCoverAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const rank = text(data, "rank");
  if (!isRank(rank)) return { ok: false, error: "Choose primary or backup." };

  const skuIds = data.getAll("skuId").map(String).filter(Boolean);
  const supplierId = text(data, "supplierId") || null;

  const result = await bulkSetCover(skuIds, rank, supplierId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/suppliers/cover");

  const { changed, skipped } = result.value;
  const word = rank === "Primary" ? "primary" : "backup";
  const head = supplierId
    ? `${changed} ${changed === 1 ? "pack" : "packs"} moved to this ${word}.`
    : `${changed} ${word} ${changed === 1 ? "assignment" : "assignments"} cleared.`;

  if (skipped.length === 0) return { ok: true, message: head };

  return {
    ok: true,
    message:
      `${head} ${skipped.length} skipped: ` +
      skipped
        .slice(0, 5)
        .map((s) => `${s.skuCode} (${s.why})`)
        .join("; ") +
      (skipped.length > 5 ? `, and ${skipped.length - 5} more.` : ""),
  };
}
