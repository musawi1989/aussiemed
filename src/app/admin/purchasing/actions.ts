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
  sendAllDraftPurchaseOrders,
  setAutoSend,
  setPurchaseOrderPayment,
} from "@/lib/purchasing";
import { setPurchaseLineQuantities } from "@/lib/purchase-lines";
import { createDocket } from "@/lib/dockets";
import { audit, requireAdmin } from "@/lib/admin";
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

  const { created, sent, unsent, autoSent, unsourceable } = result.value;
  if (created.length === 0) {
    return {
      ok: true,
      message:
        unsourceable.length > 0
          ? `Nothing could be ordered. ${unsourceable.length} line${unsourceable.length === 1 ? "" : "s"} cannot be sourced.`
          : "Nothing to buy — every ordered line is already on a purchase order.",
    };
  }

  /*
   * "Built" is no longer the whole story.
   *
   * Under the monthly model a run opens an order for a supplier who has none
   * this month and ADDS to the one they already have otherwise. Reporting
   * every run as "2 drafts built" would tell somebody two new documents exist
   * when one of them is the order they sent a fortnight ago.
   */
  const opened = created.filter((po) => po.opened);
  const addedTo = created.filter((po) => !po.opened);
  const lines = created.reduce((n, po) => n + po.lineCount, 0);

  const parts: string[] = [];
  if (opened.length > 0) {
    parts.push(
      `${opened.length} monthly order${opened.length === 1 ? "" : "s"} opened`
    );
  }
  if (addedTo.length > 0) {
    parts.push(
      `${addedTo.length} existing order${addedTo.length === 1 ? "" : "s"} added to`
    );
  }

  /*
   * What auto-send did, said plainly.
   *
   * Whether the suppliers have actually been told is the thing the person who
   * clicked Build needs to know, and it used to be missing entirely because
   * auto-send did nothing. An order that could not be sent is named, not
   * counted: "one failed" sends somebody hunting through the list for which.
   */
  if (autoSent) {
    if (sent.length > 0) {
      parts.push(`${sent.length} sent to ${sent.length === 1 ? "the supplier" : "suppliers"}`);
    }
    if (unsent.length > 0) {
      parts.push(
        `NOT sent: ${unsent.map((po) => `${po.poNumber} (${po.reason})`).join("; ")}`
      );
    }
  }

  return {
    ok: true,
    message:
      `${parts.join(", ")} — ${lines} line${lines === 1 ? "" : "s"}` +
      (unsourceable.length > 0
        ? `. ${unsourceable.length} could not be sourced.`
        : "."),
  };
}

/**
 * Push every draft to its supplier in one go.
 *
 * Reports what went and names what did not, rather than returning a count.
 * A draft that refuses is nearly always one with no lines on it, and that is
 * a thing somebody has to go and look at.
 */
export async function sendAllAction(
  _state: FormState,
  _data: FormData
): Promise<FormState> {
  const result = await sendAllDraftPurchaseOrders();
  if (!result.ok) return { ok: false, error: result.error };

  refresh();

  const { sent, failed } = result.value;

  if (sent.length === 0 && failed.length === 0) {
    return { ok: true, message: "There were no drafts waiting to be sent." };
  }

  const suppliers = new Set(sent.map((po) => po.supplierName)).size;
  const parts: string[] = [];

  if (sent.length > 0) {
    parts.push(
      `${sent.length} purchase order${sent.length === 1 ? "" : "s"} sent to ` +
        (suppliers === 1 ? sent[0].supplierName : `${suppliers} suppliers`)
    );
  }
  if (failed.length > 0) {
    parts.push(
      `NOT sent: ${failed.map((po) => `${po.poNumber} (${po.reason})`).join("; ")}`
    );
  }

  const message = `${parts.join(". ")}.`;

  // Anything left behind makes this a failure, even when most of them went:
  // a green tick over "one was not sent" is how the one gets forgotten.
  return failed.length === 0
    ? { ok: true, message }
    : { ok: false, error: message };
}

/**
 * A delivery docket recorded on the supplier's behalf.
 *
 * Most suppliers raise their own in the portal. Some ring up, or send a
 * scanned docket with the driver, and the alternative to recording it here is
 * that the consignment exists on paper and nowhere else — which is how a
 * part-delivered order ends up looking unfulfilled for a fortnight. Stamped
 * with role Admin so the docket says who actually entered it.
 */
export async function recordDocketAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const actor = await requireAdmin("purchasing");

  const purchaseOrderId = text(data, "id");
  const poNumber = text(data, "poNumber");

  // Paired positionally: one hidden line id beside each quantity, the same
  // arrangement the supplier form and the goods-in form both use.
  const lineIds = data.getAll("docketLineId").map(String);
  const quantities = data
    .getAll("docketQty")
    .map((v) => Number(String(v).trim() || "0"));
  const lines = lineIds.map((purchaseOrderLineId, index) => ({
    purchaseOrderLineId,
    qty: quantities[index],
  }));

  const result = await createDocket({
    purchaseOrderId,
    lines,
    courier: text(data, "courier") || null,
    trackingNumber: text(data, "trackingNumber") || null,
    note: text(data, "note") || null,
    dispatched: true,
    actor: { id: actor.id, name: actor.name, role: "Admin" },
  });
  if (!result.ok) return { ok: false, error: result.error };

  await audit(actor, "purchaseOrder.docket", "PurchaseOrder", poNumber, null, {
    docket: result.value.sequence,
    units: lines.reduce((n, l) => n + l.qty, 0),
    complete: result.value.complete,
    onBehalfOfSupplier: true,
  });

  refresh();
  revalidatePath(`/admin/purchasing/${poNumber}`);

  return {
    ok: true,
    message: result.value.complete
      ? `Docket ${result.value.sequence} recorded. That completes the order.`
      : `Docket ${result.value.sequence} recorded. The rest stays outstanding.`,
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

  const result = await receivePurchaseOrder(id, lines, text(data, "requestKey") || undefined);
  if (!result.ok) return { ok: false, error: result.error };

  refresh();
  revalidatePath(`/admin/purchasing/${text(data, "poNumber")}`);
  revalidatePath("/admin/received-products");

  const { unitsReceived, shortfall, status } = result.value;
  return {
    ok: true,
    message:
      `${unitsReceived} unit${unitsReceived === 1 ? "" : "s"} booked in` +
      (shortfall > 0
        ? `. ${shortfall} still outstanding with the supplier. Received goods await allocation.`
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
            ? "Auto-send on. Purchase orders will go to their suppliers as soon as you build a run, without review."
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

/**
 * Recording what a supplier told us off-screen, and correcting a draft.
 *
 * The form posts one triple per line — id, ordered, confirmed — which FormData
 * gives back as parallel lists, read positionally and zipped. A blank confirmed
 * box clears the line back to "they have not said", which is a real answer and
 * different from zero.
 */
export async function setLineQuantitiesAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const purchaseOrderId = String(data.get("id") ?? "").trim();
  const poNumber = String(data.get("poNumber") ?? "").trim();
  const editable = data.get("ordersEditable") !== null;

  const lineIds = data.getAll("lineId").map(String);
  const confirmed = data.getAll("qtyConfirmed").map((v) => String(v).trim());
  const ordered = data.getAll("qtyOrdered").map((v) => String(v).trim());

  const edits = lineIds.map((lineId, i) => ({
    lineId,
    qtyConfirmed:
      confirmed[i] === undefined
        ? undefined
        : confirmed[i] === ""
          ? null
          : Number(confirmed[i]),
    // Only read when the order is still a draft. A sent order does not render
    // these inputs, and the service refuses them anyway.
    qtyOrdered:
      editable && ordered[i] !== undefined && ordered[i] !== ""
        ? Number(ordered[i])
        : undefined,
  }));

  if (
    edits.some(
      (e) =>
        (e.qtyConfirmed !== null &&
          e.qtyConfirmed !== undefined &&
          !Number.isFinite(e.qtyConfirmed)) ||
        (e.qtyOrdered !== undefined && !Number.isFinite(e.qtyOrdered))
    )
  ) {
    return { ok: false, error: "One of the quantities is not a number." };
  }

  const result = await setPurchaseLineQuantities(
    purchaseOrderId,
    edits,
    String(data.get("note") ?? "")
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/purchasing/${poNumber}`);
  revalidatePath("/admin/purchasing");
  revalidatePath("/admin/purchasing/backorders");

  const n = result.value.changed;
  return { ok: true, message: `${n} line${n === 1 ? "" : "s"} updated.` };
}
