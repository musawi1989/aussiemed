import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";
import { recordStatus } from "./status-events";
import { purchaseOrderSent } from "./email-message";
import { sendQuietly } from "./mailer";
import { publicUrl } from "./public-url";
import {
  allocateReceipt,
  planPurchaseOrders,
  type DemandLine,
  type PurchasePlan,
} from "./purchase-plan";
import {
  DEFAULT_CUTOFF_HOUR,
  isValidCutoffHour,
  lastCutoffBefore,
  parseCutoffHour,
} from "./cutoff";

/**
 * Buying — BE-36, DEC-26.
 *
 * Customer orders accumulate through the day. At the cutoff this pools every
 * unpurchased line into one draft purchase order per supplier, quantities
 * summed per item, for a person to review and send.
 *
 * Two rules run through everything here:
 *
 *  1. A purchase order carries no customer. Not a name, not an address, not a
 *     reference, not a count of them — see SEC-05. The link between a received
 *     unit and the customer waiting for it lives in PurchaseAllocation, on our
 *     side of the wall.
 *  2. Nothing sends itself unless an admin has turned that on. Sending commits
 *     money to a supplier, so the default is a draft and a person.
 */

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export const CUTOFF_HOUR_KEY = "purchaseCutoffHourDubai";
export const AUTO_SEND_KEY = "purchaseAutoSend";

// The cutoff arithmetic itself lives in cutoff.ts, which is pure and tested,
// so the buying run and the countdown a buyer sees cannot disagree about when
// the day closes.
export { DEFAULT_CUTOFF_HOUR, lastCutoffBefore } from "./cutoff";

export async function getCutoffHour(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: CUTOFF_HOUR_KEY } });
  const parsed = parseCutoffHour(row?.value);
  return parsed ?? DEFAULT_CUTOFF_HOUR;
}

/**
 * Moves the daily cutoff.
 *
 * Takes effect immediately and changes nothing already bought: purchase orders
 * are built against the cutoff that had passed when they were built, and this
 * only decides when the next one closes. What it does change is the deadline
 * every buyer is shown, which is why it is audited.
 */
export async function setCutoffHour(hour: number): Promise<Result> {
  const actor = await requireAdmin();

  if (!isValidCutoffHour(hour)) {
    return fail("Choose a whole hour of the day, from 0 to 23.");
  }

  const before = await getCutoffHour();
  if (before === hour) return ok(undefined);

  await db.setting.upsert({
    where: { key: CUTOFF_HOUR_KEY },
    update: { value: String(hour) },
    create: { key: CUTOFF_HOUR_KEY, value: String(hour) },
  });

  await audit(actor, "purchasing.cutoffHour", "Setting", CUTOFF_HOUR_KEY, { hour: before }, { hour });
  return ok(undefined);
}

export async function getAutoSend(): Promise<boolean> {
  const row = await db.setting.findUnique({ where: { key: AUTO_SEND_KEY } });
  return row?.value === "true";
}

export async function setAutoSend(on: boolean): Promise<Result> {
  const actor = await requireAdmin();
  const before = await getAutoSend();

  await db.setting.upsert({
    where: { key: AUTO_SEND_KEY },
    update: { value: String(on) },
    create: { key: AUTO_SEND_KEY, value: String(on) },
  });

  await audit(actor, "purchasing.autoSend", "Setting", AUTO_SEND_KEY, { on: before }, { on });
  return ok(undefined);
}

/* ------------------------------------------------------------------ *
 * Demand
 * ------------------------------------------------------------------ */

/**
 * Everything ordered but not yet bought, at or before the cutoff.
 *
 * A line counts as bought once allocations cover its quantity, so a line half
 * covered by an earlier purchase order returns here for the remainder. That is
 * what makes running the build twice safe.
 */
export async function outstandingDemand(cutoffAt: Date): Promise<DemandLine[]> {
  const items = await db.orderItem.findMany({
    where: {
      status: { notIn: ["Cancelled"] },
      order: { placedAt: { lte: cutoffAt }, status: { notIn: ["Cancelled"] } },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      qty: true,
      skuId: true,
      skuCodeSnapshot: true,
      nameSnapshot: true,
      allocations: { select: { qty: true } },
      sku: {
        select: {
          supplies: {
            select: {
              rank: true,
              costFils: true,
              supplierPartNumber: true,
              isAvailable: true,
              supplier: {
                select: { id: true, companyName: true, isAvailable: true, status: true },
              },
            },
          },
        },
      },
    },
  });

  const demand: DemandLine[] = [];

  for (const item of items) {
    const bought = item.allocations.reduce((n, a) => n + a.qty, 0);
    const outstanding = item.qty - bought;
    if (outstanding <= 0) continue;

    demand.push({
      orderItemId: item.id,
      skuId: item.skuId ?? "",
      skuCode: item.skuCodeSnapshot,
      name: item.nameSnapshot,
      qty: outstanding,
      supplies: (item.sku?.supplies ?? []).map((supply) => ({
        supplierId: supply.supplier.id,
        supplierName: supply.supplier.companyName,
        rank: supply.rank === "Backup" ? "Backup" : "Primary",
        // Both facts have to hold: the company open, and the item available
        // from them. A retired supplier is unavailable whatever its flag says.
        available:
          supply.isAvailable &&
          supply.supplier.isAvailable &&
          supply.supplier.status === "Active",
        costFils: supply.costFils,
        supplierPartNumber: supply.supplierPartNumber,
      })),
    });
  }

  return demand;
}

/** What the build would do, without writing anything. */
export async function previewPurchaseOrders(cutoffAt: Date): Promise<PurchasePlan> {
  return planPurchaseOrders(await outstandingDemand(cutoffAt));
}

/* ------------------------------------------------------------------ *
 * Building
 * ------------------------------------------------------------------ */

function formatPoNumber(year: number, sequence: number): string {
  return `PO-${year}-${String(sequence).padStart(6, "0")}`;
}

export type BuildResult = {
  // The id as well as the number: the status log keys on the row, and the
  // number is what a person reads.
  created: {
    id: string;
    poNumber: string;
    supplierName: string;
    lineCount: number;
  }[];
  unsourceable: PurchasePlan["unsourceable"];
};

/**
 * Builds the drafts and reserves the demand behind them.
 *
 * Allocations are written now, at draft, rather than at goods-in. Without that
 * the next run would pool the same customer lines a second time and order
 * everything twice. Cancelling a draft releases them again.
 */
export async function buildPurchaseOrders(
  cutoffAt: Date
): Promise<Result<BuildResult>> {
  const actor = await requireAdmin();
  const plan = planPurchaseOrders(await outstandingDemand(cutoffAt));

  if (plan.orders.length === 0) {
    return ok({ created: [], unsourceable: plan.unsourceable });
  }

  const created = await db.$transaction(async (tx) => {
    const year = cutoffAt.getUTCFullYear();
    const key = `poSequence:${year}`;
    const current = await tx.setting.findUnique({ where: { key } });
    let sequence = current ? Number(current.value) : 0;

    const made: BuildResult["created"] = [];

    for (const order of plan.orders) {
      sequence += 1;
      const po = await tx.purchaseOrder.create({
        data: {
          poNumber: formatPoNumber(year, sequence),
          supplierId: order.supplierId,
          status: "Draft",
          cutoffAt,
          // Null travels through rather than collapsing to zero — the plan
          // already returns null when any line's cost is unknown, and
          // flattening it here is what made an order of uncosted lines read
          // as free.
          totalCostFils: order.totalCostFils,
        },
      });

      for (const line of order.lines) {
        const poLine = await tx.purchaseOrderLine.create({
          data: {
            purchaseOrderId: po.id,
            skuId: line.skuId,
            supplierPartNumberSnapshot: line.supplierPartNumber,
            nameSnapshot: line.name,
            skuCodeSnapshot: line.skuCode,
            unitCostFilsSnapshot: line.unitCostFils,
            qtyOrdered: line.qtyOrdered,
            wasFallback: line.wasFallback,
            lineCostFils:
              line.unitCostFils === null
                ? null
                : line.unitCostFils * line.qtyOrdered,
          },
        });

        for (const allocation of line.allocations) {
          await tx.purchaseAllocation.create({
            data: {
              purchaseOrderLineId: poLine.id,
              orderItemId: allocation.orderItemId,
              qty: allocation.qty,
              allocatedBy: actor.id,
            },
          });
        }
      }

      made.push({
        id: po.id,
        poNumber: po.poNumber,
        supplierName: order.supplierName,
        lineCount: order.lines.length,
      });
    }

    await tx.setting.upsert({
      where: { key },
      update: { value: String(sequence) },
      create: { key, value: String(sequence) },
    });

    return made;
  });

  for (const po of created) {
    await audit(actor, "purchaseOrder.build", "PurchaseOrder", po.poNumber, null, {
      supplier: po.supplierName,
      lines: po.lineCount,
    });
    // The first event in the order's life, so every later duration has
    // something to measure from — BE-30.
    await recordStatus({
      entity: "PurchaseOrder",
      entityId: po.id,
      entityRef: po.poNumber,
      toStatus: "Draft",
      actor: { id: actor.id, name: actor.name, role: "Admin" },
    });
  }

  return ok({ created, unsourceable: plan.unsourceable });
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

export async function sendPurchaseOrder(id: string): Promise<Result> {
  const actor = await requireAdmin();

  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      _count: { select: { lines: true } },
      supplier: {
        select: {
          companyName: true,
          primaryEmail: true,
          secondaryEmail: true,
        },
      },
      lines: {
        orderBy: { skuCodeSnapshot: "asc" },
        select: {
          supplierPartNumberSnapshot: true,
          skuCodeSnapshot: true,
          nameSnapshot: true,
          qtyOrdered: true,
        },
      },
    },
  });
  if (!po) return fail("That purchase order no longer exists.");
  if (po.status !== "Draft") return fail(`It has already been ${po.status.toLowerCase()}.`);
  if (po._count.lines === 0) return fail("There is nothing on it to send.");

  const sentAt = new Date();
  await db.purchaseOrder.update({
    where: { id },
    data: { status: "Sent", sentAt },
  });

  await audit(actor, "purchaseOrder.send", "PurchaseOrder", id, { status: "Draft" }, { status: "Sent" });

  await recordStatus({
    entity: "PurchaseOrder",
    entityId: id,
    entityRef: po.poNumber,
    fromStatus: "Draft",
    toStatus: "Sent",
    actor: { id: actor.id, name: actor.name, role: "Admin" },
    at: sentAt,
  });

  // After the status, and never able to undo it. A purchase order the supplier
  // has been told about is sent; a bounced email is a mail problem, visible on
  // /admin/emails, not a reason to put the order back into draft.
  //
  // Nothing about a customer travels in this message — the template is pure
  // and tested for exactly that.
  // Both addresses, which is why the supplier has two. A purchase order that
  // reached one person who is on leave has not reached the supplier, and the
  // second address exists precisely so that is not a single point of failure.
  // Sent separately rather than as one To line so each has its own record and
  // one bad address cannot suppress the other.
  const addresses = [
    ...new Set(
      [po.supplier.primaryEmail, po.supplier.secondaryEmail]
        .map((value) => (value ?? "").trim())
        .filter(Boolean)
    ),
  ];

  for (const address of addresses) {
    await sendQuietly(
      purchaseOrderSent({
        to: address,
        supplierName: po.supplier.companyName,
        poNumber: po.poNumber,
        sentAt,
        expectedAt: po.expectedAt,
        lines: po.lines.map((line) => ({
          supplierPartNumber: line.supplierPartNumberSnapshot,
          skuCode: line.skuCodeSnapshot,
          name: line.nameSnapshot,
          qtyOrdered: line.qtyOrdered,
        })),
        portalUrl: `${publicUrl()}/business-portal`,
      }),
      {
        entity: "PurchaseOrder",
        entityId: id,
        dedupeKey: `PurchaseOrderSent:${po.poNumber}:${address}`,
      }
    );
  }

  return ok(undefined);
}

/** Releases the demand so the next build can place it elsewhere. */
export async function cancelDraftPurchaseOrder(id: string): Promise<Result> {
  const actor = await requireAdmin();

  const po = await db.purchaseOrder.findUnique({ where: { id } });
  if (!po) return fail("That purchase order no longer exists.");
  if (po.status !== "Draft") {
    return fail("Only a draft can be cancelled this way — it has already been sent.");
  }

  // Deleting the lines cascades to their allocations, which is what puts the
  // customer lines back into outstanding demand.
  await db.purchaseOrder.delete({ where: { id } });

  await audit(actor, "purchaseOrder.cancelDraft", "PurchaseOrder", po.poNumber, {
    status: "Draft",
  }, null);

  // Recorded even though the purchase order row is gone. The events outlive
  // what they describe on purpose — a draft that was built and thrown away is
  // itself worth knowing about when the buying run is being tuned.
  await recordStatus({
    entity: "PurchaseOrder",
    entityId: id,
    entityRef: po.poNumber,
    fromStatus: "Draft",
    toStatus: "Cancelled",
    actor: { id: actor.id, name: actor.name, role: "Admin" },
  });

  return ok(undefined);
}

/* ------------------------------------------------------------------ *
 * Goods in
 * ------------------------------------------------------------------ */

export type ReceiptLine = {
  lineId: string;
  qtyReceived: number;
  batchCode: string | null;
  expiresOn: Date | null;
};

export type ReceiptResult = {
  linesReceived: number;
  unitsReceived: number;
  /** Units ordered but not delivered, which return to the buying queue. */
  shortfall: number;
  status: string;
};

/**
 * Booking a delivery in at the sorting facility — BE-37.
 *
 * This is where the cross-dock model closes. Goods arrive pooled by item with
 * no idea who they are for; this records what physically turned up, stamps the
 * batch and expiry on it, and assigns the units to the customers waiting —
 * without the supplier ever learning a customer existed.
 *
 * Short deliveries are the normal case, not an error. Whatever did not arrive
 * stops being reserved and returns to outstanding demand, which puts it on the
 * next purchase order by itself.
 */
export async function receivePurchaseOrder(
  id: string,
  lines: ReceiptLine[]
): Promise<Result<ReceiptResult>> {
  const actor = await requireAdmin();

  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: { lines: { select: { id: true, qtyOrdered: true, qtyReceived: true } } },
  });

  if (!po) return fail("That purchase order no longer exists.");
  if (po.status === "Draft") return fail("It has not been sent to the supplier yet.");
  if (po.status === "Cancelled") return fail("It was cancelled.");

  const byId = new Map(po.lines.map((l) => [l.id, l]));
  for (const line of lines) {
    const existing = byId.get(line.lineId);
    if (!existing) return fail("A line on this receipt does not belong to this order.");
    if (line.qtyReceived < 0) return fail("A received quantity cannot be negative.");
    if (line.qtyReceived > existing.qtyOrdered) {
      return fail(
        `More was received than ordered on one line (${line.qtyReceived} of ${existing.qtyOrdered}). ` +
          `Record what was ordered and raise the difference separately.`
      );
    }
  }

  const outcome = await db.$transaction(async (tx) => {
    let unitsReceived = 0;
    let shortfall = 0;

    for (const line of lines) {
      const reserved = await tx.purchaseAllocation.findMany({
        where: { purchaseOrderLineId: line.lineId },
        select: {
          id: true,
          qty: true,
          orderItemId: true,
          orderItem: { select: { id: true, qty: true, order: { select: { placedAt: true } } } },
        },
      });

      const filled = allocateReceipt(
        line.qtyReceived,
        reserved.map((r) => ({
          allocationId: r.id,
          qty: r.qty,
          placedAt: r.orderItem.order.placedAt.getTime(),
        }))
      );

      for (const result of filled) {
        if (result.filled === 0) {
          // Nothing arrived for this customer. Releasing the reservation is
          // what returns them to the buying queue rather than leaving them
          // waiting on a delivery that has already been and gone.
          await tx.purchaseAllocation.delete({ where: { id: result.allocationId } });
        } else {
          await tx.purchaseAllocation.update({
            where: { id: result.allocationId },
            data: {
              qty: result.filled,
              batchCode: line.batchCode,
              expiresOn: line.expiresOn,
            },
          });
        }
        shortfall += result.shortfall;
      }

      unitsReceived += line.qtyReceived;

      await tx.purchaseOrderLine.update({
        where: { id: line.lineId },
        data: { qtyReceived: { increment: line.qtyReceived } },
      });
    }

    /* Bring each affected customer line up to date. */
    const touched = await tx.purchaseAllocation.findMany({
      where: { purchaseOrderLine: { purchaseOrderId: id } },
      select: {
        orderItemId: true,
        batchCode: true,
        expiresOn: true,
        orderItem: { select: { id: true, qty: true, batchCodeSnapshot: true } },
      },
    });

    const seen = new Set<string>();
    for (const allocation of touched) {
      if (seen.has(allocation.orderItemId)) continue;
      seen.add(allocation.orderItemId);

      const all = await tx.purchaseAllocation.findMany({
        where: { orderItemId: allocation.orderItemId },
        select: { qty: true },
      });
      const covered = all.reduce((n, a) => n + a.qty, 0);

      await tx.orderItem.update({
        where: { id: allocation.orderItemId },
        data: {
          // Allocated stops meaning reserved and starts meaning physically
          // here and assigned to this customer.
          status: covered >= allocation.orderItem.qty ? "Allocated" : "Pending",
          // The line's own record of what it was filled from. The per-unit
          // truth lives on the allocation; this is the readable summary that
          // travels onto the delivery note.
          batchCodeSnapshot:
            allocation.orderItem.batchCodeSnapshot ?? allocation.batchCode,
          expiresOnSnapshot: allocation.expiresOn,
        },
      });
    }

    /* Received in full only when every line is. */
    const after = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: id },
      select: { qtyOrdered: true, qtyReceived: true },
    });
    const complete = after.every((l) => l.qtyReceived >= l.qtyOrdered);
    const anything = after.some((l) => l.qtyReceived > 0);
    const status = complete ? "Received" : anything ? "PartiallyReceived" : po.status;

    await tx.purchaseOrder.update({
      where: { id },
      data: { status, receivedAt: complete ? new Date() : po.receivedAt },
    });

    return { linesReceived: lines.length, unitsReceived, shortfall, status };
  });

  await audit(actor, "purchaseOrder.receive", "PurchaseOrder", po.poNumber, {
    status: po.status,
  }, outcome);

  await recordStatus({
    entity: "PurchaseOrder",
    entityId: po.id,
    entityRef: po.poNumber,
    fromStatus: po.status,
    toStatus: outcome.status,
    actor: { id: actor.id, name: actor.name, role: "Admin" },
  });

  return ok(outcome);
}

/*
 * Moving one line to the other supplier is deliberately not a function here.
 *
 * A line does not live on its own: moving it means taking it off one supplier's
 * order and adding it to another's, adjusting both totals, and creating the
 * second order if that supplier has none today. Written as a per-line action it
 * is easy to get subtly wrong and hard to see the result of.
 *
 * The route that already works is the one DEC-25 describes: mark the supplier
 * or that item unavailable, cancel the draft, and rebuild. Cancelling releases
 * the demand, and the fallback rule places every affected line at once — which
 * is also what will happen tomorrow, so the review matches the routine.
 */
