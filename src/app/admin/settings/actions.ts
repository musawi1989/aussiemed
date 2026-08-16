"use server";

import { revalidatePath } from "next/cache";
import { setVatRate } from "@/lib/admin";
import { setCutoffHour } from "@/lib/purchasing";
import { formatCutoffHour, parseCutoffHour } from "@/lib/cutoff";
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

export async function setCutoffHourAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const hour = parseCutoffHour(data.get("hour"));
  if (hour === null) {
    return { ok: false, error: "Choose an hour of the day." };
  }

  const result = await setCutoffHour(hour);
  if (!result.ok) return { ok: false, error: result.error };

  // Every storefront page shows the deadline, so they all have to be redrawn
  // rather than serving yesterday's promise from a cache.
  revalidatePath("/admin/settings");
  revalidatePath("/admin/purchasing");
  revalidatePath("/", "layout");

  return {
    ok: true,
    message: `Saved. Buyers now see ${formatCutoffHour(hour)}.`,
  };
}
