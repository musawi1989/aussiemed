"use server";

import { revalidatePath } from "next/cache";
import { setVatRate } from "@/lib/admin";
import type { FormState } from "@/components/AdminForm";

export async function setVatRateAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await setVatRate(Number(data.get("percent") ?? NaN));
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/settings");
  return {
    ok: true,
    message: "Saved. Orders already placed keep the rate they were placed at.",
  };
}
