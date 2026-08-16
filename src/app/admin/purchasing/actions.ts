"use server";

import { revalidatePath } from "next/cache";
import {
  buildPurchaseOrders,
  cancelDraftPurchaseOrder,
  getCutoffHour,
  lastCutoffBefore,
  receivePurchaseOrder,
  sendPurchaseOrder,
  setAutoSend,
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
