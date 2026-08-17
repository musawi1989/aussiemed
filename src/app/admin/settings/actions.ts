"use server";

import { revalidatePath } from "next/cache";
import { setToneColour } from "@/lib/tone-colours";
import { setNotifyStep } from "@/lib/order-notices";
import { requireAdmin } from "@/lib/admin";
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

export async function setToneColourAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await setToneColour(
    String(data.get("tone") ?? ""),
    String(data.get("colour") ?? "")
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/settings");
  // Every screen, not just this one: the colours are on the document root and
  // an admin who changes one expects to see it on the orders list.
  revalidatePath("/", "layout");
  return { ok: true, message: "Colour saved." };
}

export async function setNotifyStepAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  await requireAdmin();

  const step = String(data.get("step") ?? "");
  const enabled = data.getAll("enabled").at(-1) === "1";
  await setNotifyStep(step, enabled);

  revalidatePath("/admin/settings");
  return {
    ok: true,
    message: enabled
      ? "Customers will be emailed at this step."
      : "Customers will not be emailed at this step.",
  };
}
