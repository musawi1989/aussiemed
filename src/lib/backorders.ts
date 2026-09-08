import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";
import { formatPoNumber, monthWindow } from "./purchasing";
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

/**
 * A customer order sitting behind a back order.
 *
 * WHY BOTH NUMBERS. `qty` is everything this line was bought for that account;
 * `atRisk` is how much of that the shortfall actually eats. They are usually
 * different, and showing only the first overstates the damage on every line
 * where a supplier can send most of what we asked for.
 *
 * atRisk comes from takeFrom — the same tested rule the re-source button uses
 * to decide which allocations move — so the screen showing who is affected and
 * the button that moves them cannot give two different answers.
 */
export type BackorderCustomer = {
  reference: string;
  organisation: string;
  /** Units of this line allocated to that order. */
  qty: number;
  /** Units of those that the shortfall takes, if it is re-sourced. */
  atRisk: number;
};

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
  /** Who was waiting on it, most affected first. */
  customers: BackorderCustomer[];
  /**
   * Shortfall units with no customer behind them.
   *
   * Said out loud rather than left as a gap in the arithmetic: it means we
   * bought stock we chose to hold, or an allocation never happened. The second
   * is worth noticing, because it is how customer demand goes quietly
   * unfulfilled — the daily run treats an allocated unit as covered.
   */
  unallocatedShortfall: number;
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
      /* Who was waiting on this line. A back order is only interesting because
         somebody is owed something, and until now that half was invisible: the
         screen said "eight of the ten cannot come" and left finding out whose
         eight to a person opening orders one at a time. */
      allocations: {
        select: {
          id: true,
          qty: true,
          orderItemId: true,
          orderItem: {
            select: {
              order: {
                select: {
                  reference: true,
                  organisation: { select: { name: true } },
                  user: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  return lines
    .map((line) => {
      const shortfall = shortfallOf(line);

      // The same rule the re-source button uses, so the two cannot disagree
      // about which orders a shortfall touches.
      const moves = takeFrom(
        line.allocations.map((a) => ({
          id: a.id,
          orderItemId: a.orderItemId,
          qty: a.qty,
        })),
        shortfall
      );
      const risk = new Map(moves.map((m) => [m.id, m.qty]));

      const byOrder = new Map<string, BackorderCustomer>();
      for (const allocation of line.allocations) {
        const order = allocation.orderItem.order;
        // The account, then whoever placed it — the same precedence the order
        // screens use, so one order is named the same way everywhere.
        const who = order.organisation?.name ?? order.user?.name ?? "Guest";
        const existing = byOrder.get(order.reference);
        const atRisk = risk.get(allocation.id) ?? 0;

        if (existing) {
          existing.qty += allocation.qty;
          existing.atRisk += atRisk;
        } else {
          byOrder.set(order.reference, {
            reference: order.reference,
            organisation: who,
            qty: allocation.qty,
            atRisk,
          });
        }
      }

      const customers = [...byOrder.values()].sort(
        (a, b) =>
          b.atRisk - a.atRisk ||
          b.qty - a.qty ||
          a.organisation.localeCompare(b.organisation)
      );

      return {
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
        shortfall,
        placedAt: line.purchaseOrder.sentAt,
        customers,
        unallocatedShortfall: Math.max(
          0,
          shortfall - customers.reduce((n, c) => n + c.atRisk, 0)
        ),
      };
    })
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
  await requireAdmin("purchasing", "view");
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
  const actor = await requireAdmin("purchasing");

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
    /*
     * Re-sourcing joins the month's order too.
     *
     * One purchase order per supplier per month is the rule from 28 Aug 2026,
     * and it has to hold here as well: a backorder moved to a new supplier on
     * the 20th belongs on the order they are already working, not on a second
     * document for the same month. This was the one other place that created
     * purchase orders, and leaving it alone would have quietly broken the rule
     * for exactly the supplier being asked to rescue an order.
     */
    const now = new Date();
    const { from, to } = monthWindow(now);
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const open = await tx.purchaseOrder.findFirst({
      where: {
        supplierId: newSupplierId,
        cutoffAt: { gte: from, lt: to },
        status: { not: "Cancelled" },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, poNumber: true, status: true },
    });

    let po = open;

    if (!po) {
      const key = `poSequence:${year}-${String(month).padStart(2, "0")}`;
      const current = await tx.setting.findUnique({ where: { key } });
      const sequence = (current ? Number(current.value) : 0) + 1;

      po = await tx.purchaseOrder.create({
        data: {
          poNumber: formatPoNumber(year, month, sequence),
          supplierId: newSupplierId,
          status: "Draft",
          cutoffAt: now,
          // Worked out below once every line is priced; null if any is unknown.
          totalCostFils: null,
        },
        select: { id: true, poNumber: true, status: true },
      });

      await tx.setting.upsert({
        where: { key },
        update: { value: String(sequence) },
        create: { key, value: String(sequence) },
      });
    }

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
    // The sequence is written where it is claimed, above, so a re-source that
    // joined an existing order does not advance a number nobody used.

    return { poNumber: po.poNumber, lineCount: lines.length, units };
  });

  await audit(actor, "purchaseOrder.resource", "PurchaseOrder", created.poNumber, {
    from: lines.map((l) => l.purchaseOrder.poNumber),
    lineIds,
  }, { to: supplier.companyName, ...created });

  return { ok: true, value: created };
}
