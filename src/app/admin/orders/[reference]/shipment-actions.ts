"use server";

import { revalidatePath } from "next/cache";
import {
  createShipment,
  deleteShipment,
  updateShipmentTracking,
} from "@/lib/shipments";
import type { FormState } from "@/components/AdminForm";

/**
 * Despatching an order in batches, from the order screen.
 *
 * The quantities arrive as one pair of fields per line — an id and a number —
 * which FormData gives back as two parallel lists. Read positionally and
 * zipped, the same way the price-break table does it, so a line the packer
 * left blank simply carries a blank rather than needing a checkbox beside it.
 */

const trim = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();

export async function createShipmentAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const reference = trim(data, "reference");

  const ids = data.getAll("lineId").map(String);
  const qtys = data.getAll("lineQty").map((v) => String(v).trim());

  const lines = ids
    .map((orderItemId, i) => ({ orderItemId, raw: qtys[i] ?? "" }))
    // A blank box is "not this one", which is the ordinary case on an order
    // where two of forty lines are going today.
    .filter((line) => line.raw !== "")
    .map((line) => ({
      orderItemId: line.orderItemId,
      qty: Number(line.raw),
    }));

  // Echoed back so a refusal does not empty a form somebody filled in line by
  // line. The quantities are the expensive part to retype.
  const values: Record<string, string> = {
    courier: trim(data, "courier"),
    trackingNumber: trim(data, "trackingNumber"),
    note: trim(data, "note"),
  };

  if (lines.some((line) => !Number.isFinite(line.qty))) {
    return { ok: false, error: "One of the quantities is not a number.", values };
  }

  const result = await createShipment({
    reference,
    lines,
    courier: values.courier,
    trackingNumber: values.trackingNumber,
    note: values.note,
    dispatched: data.get("dispatched") !== null,
  });

  if (!result.ok) return { ok: false, error: result.error, values };

  revalidatePath(`/admin/orders/${reference}`);
  return {
    ok: true,
    message: `Packing list ${result.value.sequence} created. Print it from the list above.`,
  };
}

export async function updateShipmentTrackingAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const reference = trim(data, "reference");

  const result = await updateShipmentTracking({
    shipmentId: trim(data, "shipmentId"),
    courier: trim(data, "courier"),
    trackingNumber: trim(data, "trackingNumber"),
    note: trim(data, "note"),
    dispatched: data.get("dispatched") !== null,
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/orders/${reference}`);
  return { ok: true, message: "Saved." };
}

export async function deleteShipmentAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const reference = trim(data, "reference");

  const result = await deleteShipment(trim(data, "shipmentId"));
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/orders/${reference}`);
  return { ok: true, message: "Packing list removed. The lines are owed again." };
}
