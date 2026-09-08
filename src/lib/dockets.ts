import "server-only";

import { db } from "./db";
import { type Result } from "./admin";
import { requireDocketActor } from "./docket-access";
import { recordStatus } from "./status-events";
import {
  checkDocket,
  hasDocketed,
  planLines,
  statusAfterDocket,
  toFollowAfter,
  type DocketableLine,
  type DocketPlanLine,
  type ProposedDocketLine,
} from "./docket-maths";

/**
 * Delivery dockets against a purchase order — the reading and the writing.
 *
 * The arithmetic lives in docket-maths.ts and is tested on its own; everything
 * here is the database around it. The same split shipments.ts and
 * shipment-maths.ts use on the customer side.
 *
 * Read callers scope the purchase order to their session. Writes additionally
 * verify the current actor's permission before changing a consignment.
 */

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });
class DocketConflict extends Error {}

export type DocketSummary = {
  id: string;
  sequence: number;
  courier: string | null;
  trackingNumber: string | null;
  dispatchedAt: Date | null;
  note: string | null;
  createdAt: Date;
  createdByName: string;
  createdByRole: string;
  units: number;
  lineCount: number;
  lines: { purchaseOrderLineId: string; qty: number; name: string; code: string }[];
};

export type DocketPlan = {
  purchaseOrderId: string;
  poNumber: string;
  status: string;
  supplierName: string;
  lines: DocketPlanLine[];
  dockets: DocketSummary[];
  /** Nothing left to send. */
  complete: boolean;
  /** Something has gone, but not all of it. */
  partial: boolean;
};

const lineSelect = {
  id: true,
  nameSnapshot: true,
  skuCodeSnapshot: true,
  supplierPartNumberSnapshot: true,
  qtyOrdered: true,
  qtyConfirmed: true,
  qtyReceived: true,
  docketLines: { select: { qty: true, docket: { select: { sequence: true, dispatchedAt: true } } } },
} as const;

type LoadedLine = {
  id: string;
  nameSnapshot: string;
  skuCodeSnapshot: string;
  qtyOrdered: number;
  qtyConfirmed: number | null;
  qtyReceived: number;
  docketLines: { qty: number; docket: { sequence: number; dispatchedAt: Date | null } }[];
};

/** The shape docket-maths works on, built from database rows. */
function toDocketable(lines: LoadedLine[], dispatchedOnly = false): DocketableLine[] {
  return lines.map((line) => ({
    id: line.id,
    name: line.nameSnapshot,
    skuCode: line.skuCodeSnapshot,
    qtyOrdered: line.qtyOrdered,
    qtyConfirmed: line.qtyConfirmed,
    docketed: Math.max(line.qtyReceived, line.docketLines.filter(d => !dispatchedOnly || d.docket.dispatchedAt).reduce((n, d) => n + d.qty, 0)),
  }));
}

/**
 * What is still owed on an order, and every docket raised against it so far.
 *
 * Returns null for an order that does not exist, so the caller chooses between
 * a 404 and a refusal rather than having one chosen for it here.
 */
export async function docketPlan(
  purchaseOrderId: string
): Promise<DocketPlan | null> {
  const po = await db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: {
      id: true,
      poNumber: true,
      status: true,
      supplier: { select: { companyName: true } },
      lines: { orderBy: { skuCodeSnapshot: "asc" }, select: lineSelect },
      dockets: {
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
          createdByRole: true,
          lines: { select: { qty: true, purchaseOrderLineId: true, purchaseOrderLine: { select: { nameSnapshot: true, skuCodeSnapshot: true } } } },
        },
      },
    },
  });
  if (!po) return null;

  const docketable = toDocketable(po.lines);
  const plan = planLines(docketable);

  return {
    purchaseOrderId: po.id,
    poNumber: po.poNumber,
    status: po.status,
    supplierName: po.supplier.companyName,
    lines: plan,
    dockets: po.dockets.map((d) => ({
      id: d.id,
      sequence: d.sequence,
      courier: d.courier,
      trackingNumber: d.trackingNumber,
      dispatchedAt: d.dispatchedAt,
      note: d.note,
      createdAt: d.createdAt,
      createdByName: d.createdByName,
      createdByRole: d.createdByRole,
      units: d.lines.reduce((n, l) => n + l.qty, 0),
      lineCount: d.lines.length,
      lines: d.lines.map(line => ({ purchaseOrderLineId: line.purchaseOrderLineId, qty: line.qty, name: line.purchaseOrderLine.nameSnapshot, code: line.purchaseOrderLine.skuCodeSnapshot })),
    })),
    complete: planLines(toDocketable(po.lines, true)).every(l => l.settled),
    partial: hasDocketed(toDocketable(po.lines, true)) && !planLines(toDocketable(po.lines, true)).every(l => l.settled),
  };
}

export type CreateDocketInput = {
  purchaseOrderId: string;
  lines: ProposedDocketLine[];
  courier?: string | null;
  trackingNumber?: string | null;
  note?: string | null;
  /** Tick when it has actually gone, rather than merely been packed. */
  dispatched: boolean;
  actor: { id: string; name: string; role: "Supplier" | "Admin" };
};

const trim = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

/**
 * Records one consignment leaving, and moves the order with it.
 *
 * ALL IN ONE TRANSACTION. The docket, its lines and the order status are one
 * fact about the world; a crash between them would leave a purchase order
 * claiming to be dispatched with no docket saying what went — the state nobody
 * could reconstruct afterwards.
 *
 * The sequence is read inside the transaction and guarded by the unique index,
 * so two people raising a docket at the same instant produce a failure rather
 * than two consignments both calling themselves docket 2.
 */
export async function createDocket(
  input: CreateDocketInput
): Promise<Result<{ sequence: number; complete: boolean }>> {
  const actor = await requireDocketActor(input.purchaseOrderId);
  input = { ...input, actor: { id: actor.id, name: actor.name, role: actor.role as "Admin" | "Supplier" } };
  const plan = await docketPlan(input.purchaseOrderId);
  if (!plan) return fail("That purchase order no longer exists.");

  if (plan.status === "Draft") {
    return fail("That purchase order has not been sent yet.");
  }
  if (plan.status === "Cancelled") {
    return fail(
      "That purchase order was cancelled, so nothing can be sent against it."
    );
  }
  if (plan.complete) {
    return fail(
      "Everything on this order has already been sent. There is nothing left to put on a docket."
    );
  }

  const check = checkDocket(
    plan.lines.map((l) => ({
      id: l.id,
      name: l.name,
      skuCode: l.skuCode,
      qtyOrdered: l.qtyOrdered,
      qtyConfirmed: l.qtyConfirmed,
      docketed: l.docketed,
    })),
    input.lines
  );
  if (!check.ok) return fail(check.error);

  const now = new Date();
  const dispatchedAt = input.dispatched ? now : null;

  let written: { sequence: number; status: string; complete: boolean };
  try {
    written = await db.$transaction(async (tx) => {
    const current = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: input.purchaseOrderId }, select: { status: true, lines: { select: lineSelect } } });
    if (["Draft", "Cancelled"].includes(current.status)) throw new DocketConflict("This purchase order cannot be dispatched.");
    const check = checkDocket(toDocketable(current.lines), input.lines);
    if (!check.ok) throw new DocketConflict(check.error);
    const last = await tx.purchaseOrderDocket.findFirst({
      where: { purchaseOrderId: input.purchaseOrderId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    const sequence = (last?.sequence ?? 0) + 1;

    const docket = await tx.purchaseOrderDocket.create({
      data: {
        purchaseOrderId: input.purchaseOrderId,
        sequence,
        courier: trim(input.courier),
        trackingNumber: trim(input.trackingNumber),
        dispatchedAt,
        note: trim(input.note),
        createdByName: input.actor.name,
        createdByRole: input.actor.role,
        lines: {
          create: check.lines.map((l) => ({
            purchaseOrderLineId: l.purchaseOrderLineId,
            qty: l.qty,
          })),
        },
      },
      select: { id: true, sequence: true },
    });

    // Re-read inside the transaction: the status has to be decided against the
    // totals INCLUDING the rows just written, not the ones loaded before them.
    const lines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: input.purchaseOrderId },
      select: lineSelect,
    });
    const after = toDocketable(lines, true);
    const status = statusAfterDocket(current.status, after);
    const complete = after.every((l) => l.qtyOrdered - l.docketed <= 0);

    const po = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: input.purchaseOrderId },
      select: { dispatchedAt: true, acknowledgedAt: true },
    });

    await tx.purchaseOrder.update({
      where: { id: input.purchaseOrderId },
      data: {
        status,
        // Set once, on the FIRST consignment to leave. It is what delivery
        // time is measured from, and a later docket must not reset the clock
        // and make a slow first delivery look prompt.
        ...(dispatchedAt && !po.dispatchedAt ? { dispatchedAt } : {}),
        // Despatching implies acknowledgement, for a supplier who skips it —
        // the rule the old whole-order despatch already followed.
        ...(po.acknowledgedAt ? {} : { acknowledgedAt: now }),
        /*
         * The order carries the LATEST consignment courier and tracking.
         *
         * The docket rows are the record; this is a convenience mirror so the
         * screens showing one courier against an order keep working and show
         * the box most recently sent. Only written when this docket actually
         * names one — a second consignment with no tracking number must not
         * blank the number belonging to the first.
         */
        ...(trim(input.courier) ? { courier: trim(input.courier) } : {}),
        ...(trim(input.trackingNumber)
          ? { trackingNumber: trim(input.trackingNumber) }
          : {}),
      },
    });

    return { sequence: docket.sequence, status, complete };
  });
  } catch (error) {
    return fail(error instanceof DocketConflict ? error.message : "The docket could not be saved. Refresh the purchase order and try again.");
  }

  // Outside the transaction: a status-log write that failed must not roll back
  // a consignment that has physically left the building.
  await recordStatus({
    entity: "PurchaseOrder",
    entityId: input.purchaseOrderId,
    entityRef: plan.poNumber,
    fromStatus: plan.status,
    toStatus: written.status,
    actor: input.actor,
  });

  return ok({ sequence: written.sequence, complete: written.complete });
}

/**
 * One docket, for the document that gets printed and put in the box.
 *
 * The "to follow" list counts dockets up to and including this one, so
 * reprinting docket 1 after docket 2 has gone still shows what docket 1 left
 * behind rather than quietly becoming a different document.
 */
export async function loadDocket(purchaseOrderId: string, sequence: number) {
  const po = await db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: {
      poNumber: true,
      cutoffAt: true,
      sentAt: true,
      expectedAt: true,
      supplier: { select: { companyName: true } },
      lines: { orderBy: { skuCodeSnapshot: "asc" }, select: lineSelect },
      dockets: {
        where: { sequence },
        select: {
          sequence: true,
          courier: true,
          trackingNumber: true,
          dispatchedAt: true,
          note: true,
          createdAt: true,
          createdByName: true,
          lines: { select: { qty: true, purchaseOrderLineId: true } },
        },
      },
    },
  });
  if (!po || po.dockets.length === 0) return null;

  const docket = po.dockets[0];
  const onThis = new Map(docket.lines.map((l) => [l.purchaseOrderLineId, l.qty]));
  const totalDockets = await db.purchaseOrderDocket.count({
    where: { purchaseOrderId },
  });

  return {
    poNumber: po.poNumber,
    supplierName: po.supplier.companyName,
    cutoffAt: po.cutoffAt,
    sentAt: po.sentAt,
    expectedAt: po.expectedAt,
    docket,
    totalDockets,
    lines: po.lines
      .filter((l) => onThis.has(l.id))
      .map((l) => ({
        supplierPartNumber: l.supplierPartNumberSnapshot,
        skuCode: l.skuCodeSnapshot,
        name: l.nameSnapshot,
        qtyOrdered: l.qtyOrdered,
        qty: onThis.get(l.id) ?? 0,
      })),
    toFollow: toFollowAfter(
      po.lines.map((l) => ({
        id: l.id,
        name: l.nameSnapshot,
        skuCode: l.skuCodeSnapshot,
        qtyOrdered: l.qtyOrdered,
        qtyConfirmed: l.qtyConfirmed,
        docketed: l.docketLines.reduce((n, d) => n + d.qty, 0),
        dockets: l.docketLines.map((d) => ({
          sequence: d.docket.sequence,
          qty: d.qty,
          dispatchedAt: d.docket.dispatchedAt,
        })),
      })),
      sequence,
      docket.dispatchedAt ?? docket.createdAt,
    ),
  };
}
