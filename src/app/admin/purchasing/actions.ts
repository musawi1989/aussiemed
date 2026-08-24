"use server";

import { revalidatePath } from "next/cache";
import { resourceShortfalls } from "@/lib/backorders";
import {
  buildPurchaseOrders,
  cancelDraftPurchaseOrder,
  getCutoffHour,
  lastCutoffBefore,
  receivePurchaseOrder,
  sendPurchaseOrder,
  setAutoSend,
  setPurchaseOrderPayment,
} from "@/lib/purchasing";
import type { FormState } from "@/components/AdminForm";

/**
 * Thin, like every other actions file: read the form, call the service, turn
 * the Result into something the page can render. The rules live in
 * src/lib/purchasing.ts, because a server action is a public endpoint.
 */

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function refresh() {
  revalidatePath("/admin/purchasing");
}

export async function buildTodayAction(
  _state: FormState,
  _data: FormData
): Promise<FormState> {
  const cutoffAt = lastCutoffBefore(new Date(), await getCutoffHour());
  const result = await buildPurchaseOrders(cutoffAt);

  if (!result.ok) return { ok: false, error: result.error };
  refresh();

  const { created, unsourceable } = result.value;
  if (created.length === 0) {
    return {
      ok: true,
      message:
        unsourceable.length > 0
          ? `Nothing could be ordered. ${unsourceable.length} line${unsourceable.length === 1 ? "" : "s"} cannot be sourced.`
          : "Nothing to buy — every ordered line is already on a purchase order.",
    };
  }

  const lines = created.reduce((n, po) => n + po.lineCount, 0);
  return {
    ok: true,
    message:
      `${created.length} draft${created.length === 1 ? "" : "s"} built, ` +
      `${lines} line${lines === 1 ? "" : "s"}` +
      (unsourceable.length > 0
        ? `. ${unsourceable.length} could not be sourced.`
        : "."),
  };
}

export async function sendAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await sendPurchaseOrder(text(data, "id"));
  if (result.ok) {
    refresh();
    revalidatePath(`/admin/purchasing/${text(data, "poNumber")}`);
  }
  return result.ok
    ? { ok: true, message: "Sent to the supplier." }
    : { ok: false, error: result.error };
}

export async function cancelDraftAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await cancelDraftPurchaseOrder(text(data, "id"));
  if (result.ok) refresh();
  return result.ok
    ? { ok: true, message: "Draft cancelled. Its lines are back in the queue." }
    : { ok: false, error: result.error };
}

/**
 * Goods in. The line inputs post as parallel arrays — one entry per row, in
 * document order — which is how the form keeps a row's quantity, batch and
 * expiry together without inventing an id scheme in the markup.
 */
export async function receiveAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const id = text(data, "id");

  const lineIds = data.getAll("lineId").map(String);
  const quantities = data.getAll("qtyReceived").map(String);
  const batches = data.getAll("batchCode").map(String);
  const expiries = data.getAll("expiresOn").map(String);

  const lines = lineIds.map((lineId, index) => {
    const expiry = (expiries[index] ?? "").trim();
    const parsed = expiry ? new Date(`${expiry}T00:00:00Z`) : null;
    return {
      lineId,
      qtyReceived: Number(quantities[index] ?? 0),
      batchCode: (batches[index] ?? "").trim() || null,
      // An unparseable date is treated as none rather than as 1970.
      expiresOn: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
    };
  });

  if (lines.some((l) => !Number.isFinite(l.qtyReceived))) {
    return { ok: false, error: "One of the quantities is not a number." };
  }

  const result = await receivePurchaseOrder(id, lines);
  if (!result.ok) return { ok: false, error: result.error };

  refresh();
  revalidatePath(`/admin/purchasing/${text(data, "poNumber")}`);

  const { unitsReceived, shortfall, status } = result.value;
  return {
    ok: true,
    message:
      `${unitsReceived} unit${unitsReceived === 1 ? "" : "s"} booked in` +
      (shortfall > 0
        ? `. ${shortfall} short — back in the buying queue for the next order.`
        : status === "Received"
          ? ". Order complete."
          : "."),
  };
}

export async function setAutoSendAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const result = await setAutoSend(text(data, "on") === "true");
  if (result.ok) refresh();
  return result.ok
    ? {
        ok: true,
        message:
          text(data, "on") === "true"
            ? "Auto-send on. Purchase orders will go out at the cutoff without review."
            : "Auto-send off. Purchase orders wait for you.",
      }
    : { ok: false, error: result.error };
}

/**
 * What we have paid this supplier against this order.
 *
 * The amount is typed in AED and stored in fils, like every other figure that
 * reaches the database — the conversion happens here so nothing downstream
 * ever sees a decimal.
 */
export async function setPurchaseOrderPaymentAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const due = text(data, "paymentDueOn");
  const parsed = due ? new Date(`${due}T00:00:00Z`) : null;

  const aed = Number(text(data, "paidAED") || "0");
  if (!Number.isFinite(aed) || aed < 0) {
    return { ok: false, error: "Paid so far must be a number, zero or more." };
  }

  const result = await setPurchaseOrderPayment({
    id: text(data, "id"),
    paymentStatus: text(data, "paymentStatus"),
    paidFils: Math.round(aed * 100),
    // An unparseable date is treated as none rather than as 1970.
    paymentDueOn: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/purchasing");
  // The supplier sees this too, so their copy has to be refreshed with ours.
  revalidatePath("/business-portal");
  return { ok: true, message: "Payment saved. The supplier sees this." };
}

/**
 * Move the selected shortfalls to a different supplier.
 *
 * Raises a DRAFT order, deliberately: raising an order is one decision and
 * sending it is another, and this screen is where the first happens. It then
 * appears in Purchasing like any other draft and goes out the same way.
 */
export async function resourceBackordersAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const lineIds = data.getAll("lineId").map(String).filter(Boolean);
  const supplierId = text(data, "supplierId");

  if (!supplierId) return { ok: false, error: "Choose who to order these from." };

  const result = await resourceShortfalls(lineIds, supplierId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/purchasing");
  revalidatePath("/admin/purchasing/backorders");
  // The supplier's own back order list changes too: the demand has moved off
  // their line.
  revalidatePath("/business-portal");

  const { poNumber, lineCount, units } = result.value;
  return {
    ok: true,
    message: `${poNumber} raised as a draft — ${units} ${units === 1 ? "unit" : "units"} across ${lineCount} ${lineCount === 1 ? "line" : "lines"}. Send it from Purchasing when you are ready.`,
  };
}
