import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";
import { formatPoNumber } from "./purchasing";
import { shortfallOf, takeFrom } from "./backorder-maths";

/**
 * What a supplier said they cannot send, and what to do about it.
 *
 * A purchase order line now carries three numbers — asked, promised, received —
 * and the gap between the first two is a back order: units we are waiting on
 * that nobody has committed to. Before qtyConfirmed existed this gap was
 * invisible until the delivery arrived short.
 *
 * THE ALLOCATIONS ARE THE HARD PART, and the reason this is not simply "make
 * a new order". A PurchaseAllocation links a purchase order line to the
 * customer order item it was bought for, and outstandingDemand treats an
 * allocated unit as already covered. Leave the allocations on a line that will
 * never deliver and the customer demand is silently never re-bought — the
 * daily run sees it as handled and moves on. So re-sourcing MOVES allocations
 * rather than copying them.
 *
 * The original line is never rewritten. It is a document we sent: it records
 * what we asked for and what they promised, and that history is what makes a
 * short delivery answerable later. The shortfall becomes a NEW order to
 * somebody else.
 */

export type BackorderLine = {
  lineId: string;
  poId: string;
  poNumber: string;
  poStatus: string;
  supplierId: string;
  supplierName: string;
  skuId: string;
  skuCode: string;
  name: string;
  qtyOrdered: number;
  qtyConfirmed: number | null;
  /** qtyOrdered − qtyConfirmed, once they have told us. */
  shortfall: number;
  placedAt: Date | null;
};

/** Lines still open, with a confirmed shortfall. */
const OPEN = { notIn: ["Received", "Cancelled"] };

async function loadShortfalls(where: Record<string, unknown>) {
  const lines = await db.purchaseOrderLine.findMany({
    where: {
      // A confirmed shortfall only. A null qtyConfirmed means the supplier has
      // not answered yet, which is a chase rather than a back order — treating
      // silence as a refusal would re-source orders nobody has declined.
      qtyConfirmed: { not: null },
      purchaseOrder: { is: { status: OPEN, ...where } },
    },
    select: {
      id: true,
      skuId: true,
      skuCodeSnapshot: true,
      nameSnapshot: true,
      qtyOrdered: true,
      qtyConfirmed: true,
      purchaseOrder: {
        select: {
          id: true,
          poNumber: true,
          status: true,
          sentAt: true,
          supplierId: true,
          supplier: { select: { companyName: true } },
        },
      },
    },
  });

  return lines
    .map((line) => ({
      lineId: line.id,
      poId: line.purchaseOrder.id,
      poNumber: line.purchaseOrder.poNumber,
      poStatus: line.purchaseOrder.status,
      supplierId: line.purchaseOrder.supplierId,
      supplierName: line.purchaseOrder.supplier.companyName,
      skuId: line.skuId,
      skuCode: line.skuCodeSnapshot,
      name: line.nameSnapshot,
      qtyOrdered: line.qtyOrdered,
      qtyConfirmed: line.qtyConfirmed,
      shortfall: shortfallOf(line),
      placedAt: line.purchaseOrder.sentAt,
    }))
    .filter((line) => line.shortfall > 0)
    /* Sorted by order, as the client asked: a supplier working through their
       back orders is working order by order, not item by item. Newest order
       first, then a stable order within it. */
    .sort(
      (a, b) =>
        (b.placedAt?.getTime() ?? 0) - (a.placedAt?.getTime() ?? 0) ||
        a.poNumber.localeCompare(b.poNumber) ||
        a.name.localeCompare(b.name)
    );
}

/** What this supplier could not send. Their own, never anybody else's. */
export async function supplierBackorders(
  supplierId: string
): Promise<BackorderLine[]> {
  return loadShortfalls({ supplierId });
}

/** Everything outstanding across every supplier, for the admin. */
export async function allBackorders(filters: {
  supplierId?: string;
}): Promise<BackorderLine[]> {
  await requireAdmin();
  return loadShortfalls(filters.supplierId ? { supplierId: filters.supplierId } : {});
}

export type ResourceResult = {
  poNumber: string;
  lineCount: number;
  units: number;
};

/**
 * Move a set of shortfalls to a different supplier, as one new draft order.
 *
 * Draft, not sent: raising an order is a decision, sending it is another, and
 * this screen is where the first happens. It appears in Purchasing like any
 * other draft and goes out the same way.
 */
export async function resourceShortfalls(
  lineIds: string[],
  newSupplierId: string
): Promise<Result<ResourceResult>> {
  const actor = await requireAdmin();

  if (lineIds.length === 0) return { ok: false, error: "Nothing was selected." };

  const supplier = await db.supplier.findUnique({
    where: { id: newSupplierId },
    select: { id: true, companyName: true },
  });
  if (!supplier) return { ok: false, error: "That supplier no longer exists." };

  const lines = await db.purchaseOrderLine.findMany({
    where: { id: { in: lineIds } },
    select: {
      id: true,
      skuId: true,
      nameSnapshot: true,
      skuCodeSnapshot: true,
      qtyOrdered: true,
      qtyConfirmed: true,
      purchaseOrder: { select: { supplierId: true, poNumber: true } },
      allocations: {
        orderBy: { qty: "desc" },
        select: { id: true, orderItemId: true, qty: true },
      },
    },
  });

  if (lines.length !== lineIds.length) {
    return { ok: false, error: "Some of those lines no longer exist." };
  }

  for (const line of lines) {
    if (shortfallOf(line) <= 0) {
      return {
        ok: false,
        error: `${line.nameSnapshot} has nothing outstanding. Refresh the page.`,
      };
    }
    if (line.purchaseOrder.supplierId === newSupplierId) {
      return {
        ok: false,
        error: `${line.nameSnapshot} is already with ${supplier.companyName}.`,
      };
    }
  }

  // What the NEW supplier charges, and calls it. Never carried over from the
  // old one: a cost is an agreement with a particular company.
  const supplies = await db.productSupply.findMany({
    where: { supplierId: newSupplierId, skuId: { in: lines.map((l) => l.skuId) } },
    select: { skuId: true, costFils: true, supplierPartNumber: true },
  });
  const supplyBySku = new Map(supplies.map((s) => [s.skuId, s]));

  const created = await db.$transaction(async (tx) => {
    const year = new Date().getUTCFullYear();
    const key = `poSequence:${year}`;
    const current = await tx.setting.findUnique({ where: { key } });
    const sequence = (current ? Number(current.value) : 0) + 1;

    const po = await tx.purchaseOrder.create({
      data: {
        poNumber: formatPoNumber(year, sequence),
        supplierId: newSupplierId,
        status: "Draft",
        cutoffAt: new Date(),
        // Worked out below once every line is priced; null if any is unknown.
        totalCostFils: null,
      },
    });

    let total: number | null = 0;
    let units = 0;

    for (const line of lines) {
      const shortfall = shortfallOf(line);
      const supply = supplyBySku.get(line.skuId);
      const unitCost = supply?.costFils ?? null;

      const newLine = await tx.purchaseOrderLine.create({
        data: {
          purchaseOrderId: po.id,
          skuId: line.skuId,
          supplierPartNumberSnapshot: supply?.supplierPartNumber ?? null,
          nameSnapshot: line.nameSnapshot,
          skuCodeSnapshot: line.skuCodeSnapshot,
          unitCostFilsSnapshot: unitCost,
          qtyOrdered: shortfall,
          // Not a fallback in the primary/backup sense — this is a deliberate
          // re-source by a person, and flagging it as an automatic fallback
          // would misreport why it happened.
          wasFallback: false,
          lineCostFils: unitCost === null ? null : unitCost * shortfall,
        },
      });

      units += shortfall;
      total = unitCost === null || total === null ? null : total + unitCost * shortfall;

      /*
       * MOVE the customer demand, do not copy it.
       *
       * outstandingDemand counts an allocated unit as bought. Leaving these on
       * a line that will not deliver means the daily run never re-buys them
       * and the customer waits for something nobody is sending.
       */
      for (const move of takeFrom(line.allocations, shortfall)) {
        await tx.purchaseAllocation.create({
          data: {
            purchaseOrderLineId: newLine.id,
            orderItemId: move.orderItemId,
            qty: move.qty,
            allocatedBy: actor.id,
          },
        });

        if (move.remaining === 0) {
          await tx.purchaseAllocation.delete({ where: { id: move.id } });
        } else {
          await tx.purchaseAllocation.update({
            where: { id: move.id },
            data: { qty: move.remaining },
          });
        }
      }
    }

    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { totalCostFils: total },
    });
    await tx.setting.upsert({
      where: { key },
      create: { key, value: String(sequence) },
      update: { value: String(sequence) },
    });

    return { poNumber: po.poNumber, lineCount: lines.length, units };
  });

  await audit(actor, "purchaseOrder.resource", "PurchaseOrder", created.poNumber, {
    from: lines.map((l) => l.purchaseOrder.poNumber),
    lineIds,
  }, { to: supplier.companyName, ...created });

  return { ok: true, value: created };
}
