import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";

/**
 * Editing a purchase order's quantities from our side.
 *
 * WHY THIS EXISTS. A supplier can say "eight of the ten" in their portal, and
 * most of them do not — they ring up, or reply to the order email, or tell the
 * driver. Until now that answer had nowhere to go: the only hands that could
 * move qtyConfirmed were the supplier's, so a phone call stayed a phone call
 * and the buying run went on believing all ten were coming. Recording it is not
 * putting words in their mouth; it is writing down what they already said.
 *
 * TWO NUMBERS, TWO DIFFERENT RULES, and the difference is the important part:
 *
 *   qtyConfirmed — what they promise. Editable while the order is open,
 *                  because it is a record of a conversation and conversations
 *                  happen after the order is sent.
 *
 *   qtyOrdered   — what we asked for. Editable ONLY while the order is a
 *                  draft. Once it has been sent it is a document that left the
 *                  building, and quietly changing what it says we asked for
 *                  destroys the only evidence of what the supplier was
 *                  actually asked to supply. The same reasoning stops
 *                  backorders.ts rewriting a short line: a shortfall is only
 *                  answerable later because both numbers survive.
 *
 * qtyReceived is not here at all. What physically arrived is booked in at
 * goods-in against a delivery, and typing it on this screen would be recording
 * a receipt nobody took.
 *
 * EVERY CHANGE IS AUDITED with the line named, because this is one person
 * recording what another company said. If it turns out to be wrong, the
 * question "who typed that, and when" has to have an answer.
 */

export type QuantityEdit = {
  lineId: string;
  /** Null clears it back to "they have not said". Undefined leaves it alone. */
  qtyConfirmed?: number | null;
  /** Draft orders only. */
  qtyOrdered?: number;
};

const CLOSED = ["Received", "Cancelled"];

export async function setPurchaseLineQuantities(
  purchaseOrderId: string,
  edits: QuantityEdit[],
  /** What the admin says they were told, kept on the audit entry. */
  note?: string | null
): Promise<Result<{ changed: number }>> {
  const actor = await requireAdmin("purchasing");

  const po = await db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: {
      lines: {
        select: {
          id: true,
          nameSnapshot: true,
          qtyOrdered: true,
          qtyConfirmed: true,
        },
      },
    },
  });
  if (!po) return { ok: false, error: "That purchase order no longer exists." };

  if (CLOSED.includes(po.status)) {
    return {
      ok: false,
      error:
        po.status === "Cancelled"
          ? "This order was cancelled, so its quantities no longer mean anything."
          : "This order is fully received. What arrived is settled and is not edited here.",
    };
  }

  const draft = po.status === "Draft";
  const byId = new Map(po.lines.map((line) => [line.id, line]));

  // Validated in full before anything is written, so a form with one bad
  // number does not half-apply and leave somebody guessing which half.
  const writes: {
    line: (typeof po.lines)[number];
    data: { qtyConfirmed?: number | null; qtyOrdered?: number };
  }[] = [];

  for (const edit of edits) {
    const line = byId.get(edit.lineId);
    if (!line) return { ok: false, error: "That line is not on this order." };

    const data: { qtyConfirmed?: number | null; qtyOrdered?: number } = {};

    if (edit.qtyOrdered !== undefined) {
      if (!draft) {
        return {
          ok: false,
          error:
            "This order has been sent, so what we asked for cannot be changed — " +
            "it is the document the supplier is working from. Record what they " +
            "can send instead, and re-source the difference from Back orders.",
        };
      }
      if (!Number.isInteger(edit.qtyOrdered) || edit.qtyOrdered < 1) {
        return {
          ok: false,
          error: `${line.nameSnapshot}: an order has to be a whole number, one or more. Remove the line instead of ordering none.`,
        };
      }
      if (edit.qtyOrdered !== line.qtyOrdered) data.qtyOrdered = edit.qtyOrdered;
    }

    if (edit.qtyConfirmed !== undefined) {
      const value = edit.qtyConfirmed;
      if (value !== null) {
        if (!Number.isInteger(value) || value < 0) {
          return {
            ok: false,
            error: `${line.nameSnapshot}: a confirmed quantity has to be a whole number, zero or more.`,
          };
        }
        // The ceiling is whatever the line will end up asking for, so a draft
        // being raised and confirmed in one go is not refused for exceeding
        // the number it is about to stop having.
        const ceiling = data.qtyOrdered ?? line.qtyOrdered;
        if (value > ceiling) {
          return {
            ok: false,
            error: `${line.nameSnapshot}: we only ordered ${ceiling}, so they cannot be confirming ${value}. Check which line this is.`,
          };
        }
      }
      if (value !== line.qtyConfirmed) data.qtyConfirmed = value;
    }

    if (Object.keys(data).length > 0) writes.push({ line, data });
  }

  if (writes.length === 0) {
    return { ok: false, error: "Nothing was changed." };
  }

  await db.$transaction(
    writes.map((write) =>
      db.purchaseOrderLine.update({ where: { id: write.line.id }, data: write.data })
    )
  );

  await audit(
    actor,
    "purchaseOrder.quantities",
    "PurchaseOrder",
    po.poNumber,
    writes.map((w) => ({
      item: w.line.nameSnapshot,
      qtyOrdered: w.line.qtyOrdered,
      qtyConfirmed: w.line.qtyConfirmed,
    })),
    writes.map((w) => ({
      item: w.line.nameSnapshot,
      qtyOrdered: w.data.qtyOrdered ?? w.line.qtyOrdered,
      qtyConfirmed:
        w.data.qtyConfirmed !== undefined ? w.data.qtyConfirmed : w.line.qtyConfirmed,
      // Who told us, in their words. The whole point of letting an admin type
      // this is that the supplier said it somewhere off-screen.
      toldUs: note?.trim() || null,
    }))
  );

  return { ok: true, value: { changed: writes.length } };
}
