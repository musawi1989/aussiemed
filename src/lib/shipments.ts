import "server-only";

import { db } from "./db";
import { includedInPackingList } from "./consignment-maths";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "./auth";
import { audit, requireAdmin, type Result } from "./admin";
import {
  checkShipment,
  hasShipped,
  isFullyShipped,
  orderStatusAfterShipping,
  planLines,
  statusAfterShipping,
  type OrderLineForShipping,
  type ProposedLine,
  type ShippingPlanLine,
} from "./shipment-maths";

/**
 * Despatching an order in batches, each with its own paperwork and tracking.
 *
 * THE PROBLEM THIS SOLVES. An order with a back order on it goes out twice:
 * what we have today, and the rest when the supplier delivers. Until now the
 * packing list was one document listing the whole order — including the lines
 * still sitting on a shelf — and the order carried a single tracking number, so
 * the second consignment either overwrote the first or was never recorded. A
 * customer ringing about "the second box" could not be answered.
 *
 * The arithmetic lives in shipment-maths.ts and is tested there. This file is
 * the part that touches the database: read what is owed, write a batch, move
 * the statuses that follow from it.
 *
 * WHAT IS NEVER REWRITTEN. A shipment that has been created is a document that
 * went in a box. Its lines and quantities are fixed; only the courier and the
 * consignment number can be edited afterwards, because those are frequently
 * booked after the box is packed and are the one thing that legitimately
 * arrives late. Undoing a despatch is deleting it, deliberately, and only while
 * it has not been marked as gone.
 */

export type ShipmentSummary = {
  id: string;
  sequence: number;
  courier: string | null;
  trackingNumber: string | null;
  dispatchedAt: Date | null;
  note: string | null;
  createdAt: Date;
  createdByName: string;
  lines: { orderItemId: string; name: string; skuCode: string; unitLabel: string; qty: number }[];
  /** Total units in this batch, for a one-glance summary on the order screen. */
  units: number;
};

export type ShippingPlan = {
  orderId: string;
  reference: string;
  lines: ShippingPlanLine[];
  shipments: ShipmentSummary[];
  /** Nothing left to send. */
  complete: boolean;
  /** Something has gone, but not all of it. */
  partial: boolean;
  /** The number the next packing list would carry. */
  nextSequence: number;
};

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/**
 * Everything the despatch screen needs: what is owed, and what has already
 * gone in which batch.
 *
 * Read in one place rather than at each call site, because "how much of this
 * line has shipped" is the number the entire feature turns on and two
 * implementations of it would eventually disagree.
 */
export async function shippingPlan(reference: string): Promise<ShippingPlan | null> {
  await requireAdmin("orders", "view");

  const order = await db.order.findUnique({
    where: { reference },
    select: {
      id: true,
      reference: true,
      items: {
        orderBy: { nameSnapshot: "asc" },
        select: {
          id: true,
          nameSnapshot: true,
          skuCodeSnapshot: true,
          unitLabelSnapshot: true,
          qty: true,
          status: true,
          shipmentLines: { select: { qty: true, shipment: { select: { dispatchedAt: true } } } },
        },
      },
      shipments: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          courier: true,
          trackingNumber: true,
          dispatchedAt: true,
          note: true,
          createdAt: true,
          createdByName: true,
          lines: {
            select: {
              orderItemId: true,
              qty: true,
              orderItem: {
                select: {
                  nameSnapshot: true,
                  skuCodeSnapshot: true,
                  unitLabelSnapshot: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!order) return null;

  const lines: OrderLineForShipping[] = order.items.map((item) => ({
    id: item.id,
    name: item.nameSnapshot,
    skuCode: item.skuCodeSnapshot,
    unitLabel: item.unitLabelSnapshot,
    qty: item.qty,
    status: item.status,
    shipped: item.shipmentLines.filter(line => line.shipment.dispatchedAt).reduce((n, l) => n + l.qty, 0),
    reserved: item.shipmentLines.filter(line => !line.shipment.dispatchedAt).reduce((n, l) => n + l.qty, 0),
  }));

  const shipments: ShipmentSummary[] = order.shipments.map((shipment) => ({
    id: shipment.id,
    sequence: shipment.sequence,
    courier: shipment.courier,
    trackingNumber: shipment.trackingNumber,
    dispatchedAt: shipment.dispatchedAt,
    note: shipment.note,
    createdAt: shipment.createdAt,
    createdByName: shipment.createdByName,
    units: shipment.lines.reduce((n, l) => n + l.qty, 0),
    lines: shipment.lines
      .map((l) => ({
        orderItemId: l.orderItemId,
        name: l.orderItem.nameSnapshot,
        skuCode: l.orderItem.skuCodeSnapshot,
        unitLabel: l.orderItem.unitLabelSnapshot,
        qty: l.qty,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));

  return {
    orderId: order.id,
    reference: order.reference,
    lines: planLines(lines),
    shipments,
    complete: isFullyShipped(lines),
    partial: hasShipped(lines) && !isFullyShipped(lines),
    nextSequence: Math.max(0, ...shipments.map(shipment => shipment.sequence)) + 1,
  };
}

/** One batch, for its packing list. Null when there is no such shipment. */
export async function loadShipment(reference: string, sequence: number) {
  const order = await db.order.findUnique({
    where: { reference },
    select: { id: true },
  });
  if (!order) return null;

  return db.shipment.findUnique({
    where: { orderId_sequence: { orderId: order.id, sequence } },
    select: {
      id: true,
      sequence: true,
      courier: true,
      trackingNumber: true,
      dispatchedAt: true,
      note: true,
      createdAt: true,
      createdByName: true,
      lines: {
        select: {
          qty: true,
          orderItem: {
            select: {
              id: true,
              nameSnapshot: true,
              skuCodeSnapshot: true,
              unitLabelSnapshot: true,
              qty: true,
              batchCodeSnapshot: true,
              expiresOnSnapshot: true,
            },
          },
        },
      },
    },
  });
}

/**
 * What was still owed at the moment this batch was packed.
 *
 * COUNTED UP TO THIS SHIPMENT, NOT TO NOW. A packing list is a document that
 * travelled in a box; reprinting it six weeks later must produce the same
 * piece of paper. If "to follow" were computed from today's outstanding, a
 * reprint after the final despatch would show nothing to follow — quietly
 * contradicting the copy the customer is holding, which is exactly the
 * disagreement that makes people stop trusting the paperwork.
 */
export async function toFollowAfter(
  reference: string,
  sequence: number
): Promise<{ name: string; skuCode: string; qty: number }[]> {
  const order = await db.order.findUnique({
    where: { reference },
    select: {
      shipments: { where: { sequence }, select: { dispatchedAt: true, createdAt: true } },
      items: {
        orderBy: { nameSnapshot: "asc" },
        select: {
          nameSnapshot: true,
          skuCodeSnapshot: true,
          qty: true,
          status: true,
          shipmentLines: {
            select: { qty: true, shipment: { select: { sequence: true, dispatchedAt: true } } },
          },
        },
      },
    },
  });
  if (!order || !order.shipments[0]) return [];
  const asOf = order.shipments[0].dispatchedAt ?? order.shipments[0].createdAt;

  return order.items
    .filter((item) => item.status !== "Cancelled")
    .map((item) => {
      const sent = item.shipmentLines
        .filter((line) => includedInPackingList(line.shipment, sequence, asOf))
        .reduce((n, line) => n + line.qty, 0);
      return {
        name: item.nameSnapshot,
        skuCode: item.skuCodeSnapshot,
        qty: Math.max(0, item.qty - sent),
      };
    })
    .filter((line) => line.qty > 0);
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

export type CreateShipmentInput = {
  reference: string;
  lines: ProposedLine[];
  courier?: string | null;
  trackingNumber?: string | null;
  note?: string | null;
  /** Tick when the box has actually gone, rather than merely been packed. */
  dispatched: boolean;
};

const trim = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

class ShipmentConflict extends Error {}

/**
 * Records one batch leaving, and moves everything that follows from it.
 *
 * ALL OF IT IN ONE TRANSACTION. The shipment, its lines, the per-line statuses
 * and the order status are one fact about the world, and a crash between them
 * would leave an order whose lines say they shipped and whose shipments say
 * nothing did — the exact state nobody could later reconstruct.
 *
 * The sequence number is read inside the transaction and guarded by a unique
 * index, so two people despatching the same order at the same moment produce a
 * failure rather than two boxes both labelled "Shipment 2".
 */
export async function createShipment(
  input: CreateShipmentInput
): Promise<Result<{ sequence: number }>> {
  const actor = await requireAdmin("orders");

  const plan = await shippingPlan(input.reference);
  if (!plan) return { ok: false, error: "That order no longer exists." };
  if (plan.complete) {
    return {
      ok: false,
      error: "Everything on this order has already been sent. There is nothing left to put on a packing list.",
    };
  }

  const checked = checkShipment(plan.lines, input.lines);
  if (!checked.ok) return { ok: false, error: checked.error };

  const byId = new Map(plan.lines.map((line) => [line.id, line]));

  let sequence: number;
  try {
    sequence = await db.$transaction(async (tx) => {
    const current = await tx.order.findUniqueOrThrow({ where: { id: plan.orderId }, include: { items: { include: { shipmentLines: { include: { shipment: { select: { dispatchedAt: true } } } } } } } });
    if (current.status === "Cancelled") throw new ShipmentConflict("A cancelled order cannot be dispatched.");
    const fresh = current.items.map(item => ({ id: item.id, name: item.nameSnapshot, skuCode: item.skuCodeSnapshot,
      unitLabel: item.unitLabelSnapshot, qty: item.qty, status: item.status,
      shipped: item.shipmentLines.filter(line => line.shipment.dispatchedAt).reduce((sum, line) => sum + line.qty, 0),
      reserved: item.shipmentLines.filter(line => !line.shipment.dispatchedAt).reduce((sum, line) => sum + line.qty, 0),
    }));
    const checked = checkShipment(fresh, input.lines);
    if (!checked.ok) throw new ShipmentConflict(checked.error);
    const byId = new Map(fresh.map(line => [line.id, line]));
    const existing = await tx.shipment.findFirst({ where: { orderId: plan.orderId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
    const next = (existing?.sequence ?? 0) + 1;

    await tx.shipment.create({
      data: {
        orderId: plan.orderId,
        sequence: next,
        courier: trim(input.courier),
        trackingNumber: trim(input.trackingNumber),
        note: trim(input.note),
        dispatchedAt: input.dispatched ? new Date() : null,
        createdByName: actor.name,
        lines: {
          create: checked.lines.map((line) => ({
            orderItemId: line.orderItemId,
            qty: line.qty,
          })),
        },
      },
    });

    for (const line of checked.lines) {
      const before = byId.get(line.orderItemId);
      if (!before) continue;
      const status = statusAfterShipping(before, input.dispatched ? line.qty : 0);
      if (status !== before.status) {
        await tx.orderItem.update({
          where: { id: line.orderItemId },
          data: { status },
        });
      }
    }

    // Recomputed from what the lines now say, rather than assumed from this
    // batch alone — an earlier partial despatch is part of the answer.
    const after = fresh.map((line) => {
      const sent = input.dispatched ? checked.lines.find((l) => l.orderItemId === line.id)?.qty ?? 0 : 0;
      return { ...line, shipped: line.shipped + sent };
    });

    const order = await tx.order.findUniqueOrThrow({
      where: { id: plan.orderId },
      select: { status: true },
    });
    const orderStatus = orderStatusAfterShipping(order.status, after);
    if (orderStatus !== order.status) {
      await tx.order.update({
        where: { id: plan.orderId },
        data: { status: orderStatus },
      });
      await tx.statusEvent.create({ data: { entity: "Order", entityId: plan.orderId, entityRef: plan.reference,
        fromStatus: order.status, toStatus: orderStatus, actorUserId: actor.id, actorName: actor.name, actorRole: actor.role,
      } });
    }

    return next;
  });
  } catch (error) {
    return { ok: false, error: error instanceof ShipmentConflict ? error.message : "The packing list could not be saved. Refresh the order and try again." };
  }

  await audit(
    actor,
    "order.shipment.create",
    "Order",
    plan.reference,
    null,
    {
      sequence,
      courier: trim(input.courier),
      trackingNumber: trim(input.trackingNumber),
      dispatched: input.dispatched,
      lines: checked.lines.map((line) => ({
        item: byId.get(line.orderItemId)?.name ?? line.orderItemId,
        qty: line.qty,
      })),
    }
  );

  return { ok: true, value: { sequence } };
}

/**
 * The courier and consignment number, after the fact.
 *
 * Separate from creation because this is the one thing that genuinely arrives
 * late: the box is packed and the list printed before anybody rings the
 * courier. What went in the box is not editable here, on purpose.
 */
export async function updateShipmentTracking(input: {
  shipmentId: string;
  courier?: string | null;
  trackingNumber?: string | null;
  note?: string | null;
  dispatched: boolean;
}): Promise<Result<{ reference: string; sequence: number }>> {
  const actor = await requireAdmin("orders");

  const shipment = await db.shipment.findUnique({
    where: { id: input.shipmentId },
    select: {
      id: true,
      sequence: true,
      courier: true,
      trackingNumber: true,
      note: true,
      dispatchedAt: true,
      order: { select: { reference: true } },
    },
  });
  if (!shipment) return { ok: false, error: "That shipment no longer exists." };

  let updated: { sequence: number; orderId: string };
  try {
    updated = await db.$transaction(async tx => {
  const current = await tx.shipment.findUniqueOrThrow({ where: { id: shipment.id }, include: { order: { select: { status: true } } } });
  if (input.dispatched && current.order.status === "Cancelled") throw new ShipmentConflict("A cancelled order cannot be dispatched.");
  const result = await tx.shipment.update({
    where: { id: shipment.id },
    data: {
      courier: trim(input.courier),
      trackingNumber: trim(input.trackingNumber),
      note: trim(input.note),
      // Set once. When it left is a fact about us, and a stamp that moved
      // every time somebody corrected a consignment number would flatter it.
      dispatchedAt: input.dispatched
        ? (current.dispatchedAt ?? new Date())
        : null,
    },
    select: { sequence: true, orderId: true },
  });
  await reconcileShipmentStatus(tx, result.orderId, actor);
  return result;
  });
  } catch (error) {
    return { ok: false, error: error instanceof ShipmentConflict ? error.message : "Tracking could not be saved. Refresh the order and try again." };
  }

  await audit(
    actor,
    "order.shipment.tracking",
    "Order",
    shipment.order.reference,
    {
      sequence: shipment.sequence,
      courier: shipment.courier,
      trackingNumber: shipment.trackingNumber,
      dispatchedAt: shipment.dispatchedAt,
      note: shipment.note,
    },
    {
      sequence: shipment.sequence,
      courier: trim(input.courier),
      trackingNumber: trim(input.trackingNumber),
      dispatched: input.dispatched,
      note: trim(input.note),
    }
  );

  return {
    ok: true,
    value: { reference: shipment.order.reference, sequence: updated.sequence },
  };
}

async function reconcileShipmentStatus(tx: Prisma.TransactionClient, orderId: string, actor: SessionUser) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { shipmentLines: { include: { shipment: { select: { dispatchedAt: true } } } } } } } });
  const lines = order.items.map(item => ({ id: item.id, name: item.nameSnapshot, skuCode: item.skuCodeSnapshot,
    unitLabel: item.unitLabelSnapshot, qty: item.qty, status: item.status,
    shipped: item.shipmentLines.filter(line => line.shipment.dispatchedAt).reduce((sum, line) => sum + line.qty, 0),
  }));
  for (const line of lines) {
    const status = line.status === "Cancelled" ? line.status : line.shipped >= line.qty ? "Shipped"
      : line.status === "Backordered" ? "Backordered" : line.status === "Shipped" ? "Packed" : statusAfterShipping(line, 0);
    if (status !== line.status) await tx.orderItem.update({ where: { id: line.id }, data: { status } });
  }
  const status = order.status === "Dispatched" && !isFullyShipped(lines) ? "Processing" : orderStatusAfterShipping(order.status, lines);
  if (status !== order.status) {
    await tx.order.update({ where: { id: orderId }, data: { status } });
    await tx.statusEvent.create({ data: { entity: "Order", entityId: orderId, entityRef: order.reference,
      fromStatus: order.status, toStatus: status, actorUserId: actor.id, actorName: actor.name, actorRole: actor.role,
    } });
  }
}

/**
 * Takes a packing list back, for the case where one was made by mistake.
 *
 * ONLY WHILE IT HAS NOT GONE. Once dispatchedAt is set the box is with a
 * courier, and deleting the only record of what was in it does not bring it
 * back — it just means nobody can answer the customer. Clear the despatch first
 * if that is genuinely what happened.
 *
 * ONLY THE LAST ONE. Removing shipment 2 of 3 would leave a gap in the
 * numbering that the customer's paperwork already refers to, or force a
 * renumber that rewrites what shipment 3's printed list says about itself.
 */
export async function deleteShipment(shipmentId: string): Promise<Result<{ reference: string }>> {
  const actor = await requireAdmin("orders");

  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      sequence: true,
      dispatchedAt: true,
      orderId: true,
      order: { select: { reference: true, status: true } },
      lines: { select: { orderItemId: true, qty: true } },
    },
  });
  if (!shipment) return { ok: false, error: "That shipment no longer exists." };

  if (shipment.dispatchedAt) {
    return {
      ok: false,
      error:
        "This one has been marked as gone, so it cannot be removed — the box is with a courier and this is the only record of what was in it. Clear the despatch first if that is not what happened.",
    };
  }

  const last = await db.shipment.findFirst({
    where: { orderId: shipment.orderId },
    orderBy: { sequence: "desc" },
    select: { id: true },
  });
  if (last?.id !== shipment.id) {
    return {
      ok: false,
      error:
        "Only the most recent packing list can be removed. Removing an earlier one would leave a gap in the numbering that the customer's paperwork already refers to.",
    };
  }

  try {
    await db.$transaction(async (tx) => {
    const current = await tx.shipment.findUnique({ where: { id: shipment.id }, select: { dispatchedAt: true } });
    const latest = await tx.shipment.findFirst({ where: { orderId: shipment.orderId }, orderBy: { sequence: "desc" }, select: { id: true } });
    if (!current || current.dispatchedAt || latest?.id !== shipment.id) {
      throw new ShipmentConflict("The packing list changed. Only the latest, undispatched list can be removed. Refresh the order first.");
    }
    await tx.shipment.delete({ where: { id: shipment.id } });

    // Statuses recomputed from what is left, not reversed by subtraction —
    // the same path the create side uses, so the two cannot disagree.
    const items = await tx.orderItem.findMany({
      where: { orderId: shipment.orderId },
      select: {
        id: true,
        qty: true,
        status: true,
        nameSnapshot: true,
        skuCodeSnapshot: true,
        unitLabelSnapshot: true,
        shipmentLines: { where: { shipment: { dispatchedAt: { not: null } } }, select: { qty: true } },
      },
    });

    const remaining: OrderLineForShipping[] = items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      skuCode: item.skuCodeSnapshot,
      unitLabel: item.unitLabelSnapshot,
      qty: item.qty,
      status: item.status,
      shipped: item.shipmentLines.reduce((n, l) => n + l.qty, 0),
    }));

    for (const line of remaining) {
      // Nothing left against this line and it had been moved on by a
      // despatch: put it back to Pending. Backordered and Cancelled are
      // decisions somebody made for other reasons and are left alone.
      if (
        line.shipped === 0 &&
        (line.status === "Shipped" || line.status === "Packed")
      ) {
        await tx.orderItem.update({
          where: { id: line.id },
          data: { status: "Pending" },
        });
      } else if (line.shipped < line.qty && line.status === "Shipped") {
        await tx.orderItem.update({
          where: { id: line.id },
          data: { status: "Packed" },
        });
      }
    }

    await reconcileShipmentStatus(tx, shipment.orderId, actor);
  });
  } catch (error) {
    return { ok: false, error: error instanceof ShipmentConflict ? error.message : "The packing list could not be removed. Refresh the order and try again." };
  }

  await audit(
    actor,
    "order.shipment.delete",
    "Order",
    shipment.order.reference,
    { sequence: shipment.sequence, lines: shipment.lines },
    null
  );

  return { ok: true, value: { reference: shipment.order.reference } };
}
