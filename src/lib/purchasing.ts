import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";
import {
  planPurchaseOrders,
  type DemandLine,
  type PurchasePlan,
} from "./purchase-plan";

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

/** 5pm Asia/Dubai unless configured otherwise. */
export const DEFAULT_CUTOFF_HOUR = 17;

/** UTC+4, no daylight saving — the UAE has never observed it. */
const DUBAI_OFFSET_HOURS = 4;

export async function getCutoffHour(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: CUTOFF_HOUR_KEY } });
  const parsed = Number(row?.value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23
    ? parsed
    : DEFAULT_CUTOFF_HOUR;
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

/**
 * The most recent cutoff that has passed, as an instant.
 *
 * Stored and compared in UTC; the hour is expressed in Dubai time because that
 * is where the warehouse is and 5pm has to mean 5pm to the people working it.
 */
export function lastCutoffBefore(now: Date, cutoffHour: number): Date {
  const dubai = new Date(now.getTime() + DUBAI_OFFSET_HOURS * 3_600_000);
  const cutoff = new Date(
    Date.UTC(
      dubai.getUTCFullYear(),
      dubai.getUTCMonth(),
      dubai.getUTCDate(),
      cutoffHour - DUBAI_OFFSET_HOURS,
      0,
      0,
      0
    )
  );
  // Before today's cutoff, the last one that passed was yesterday's.
  if (cutoff > now) cutoff.setUTCDate(cutoff.getUTCDate() - 1);
  return cutoff;
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
  created: { poNumber: string; supplierName: string; lineCount: number }[];
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
          totalCostFils: order.totalCostFils ?? 0,
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
            unitCostFilsSnapshot: line.unitCostFils ?? 0,
            qtyOrdered: line.qtyOrdered,
            wasFallback: line.wasFallback,
            lineCostFils: (line.unitCostFils ?? 0) * line.qtyOrdered,
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
    include: { _count: { select: { lines: true } } },
  });
  if (!po) return fail("That purchase order no longer exists.");
  if (po.status !== "Draft") return fail(`It has already been ${po.status.toLowerCase()}.`);
  if (po._count.lines === 0) return fail("There is nothing on it to send.");

  await db.purchaseOrder.update({
    where: { id },
    data: { status: "Sent", sentAt: new Date() },
  });

  await audit(actor, "purchaseOrder.send", "PurchaseOrder", id, { status: "Draft" }, { status: "Sent" });
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
  return ok(undefined);
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
