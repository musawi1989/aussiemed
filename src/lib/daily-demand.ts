import "server-only";

import { db } from "./db";
import { requireAdmin } from "./admin";
import { allocateConsignment } from "./consignment-allocation";

/**
 * What was ordered on a day, item by item, and who ordered it.
 *
 * THE QUESTION THIS ANSWERS. The buying run already pools the day's demand into
 * one purchase order per supplier — fifty gloves, not eleven orders for gloves —
 * and pooling is precisely what makes the quantities worth pricing. The cost of
 * it is that the pooled number is the only thing anybody could see afterwards.
 * "We are buying eighty of these today" was answerable; "who wants them" was
 * not, without opening every order placed that day and adding it up by hand.
 *
 * Two views over the same shape, because they are the same question asked at
 * two points in the chain:
 *
 *   ordered   — what customers asked us for on that day
 *   despatched — what a supplier actually sent us, and which customers each
 *                unit was bought for, through PurchaseAllocation
 *
 * The second is the one that closes the loop. An allocation links a purchase
 * order line to the customer order item it was bought for, so a delivery of
 * forty gloves can be read back as "twelve for Al Barsha, twenty for Deira,
 * eight unallocated" rather than as forty gloves.
 *
 * A NOTE ON WHAT THIS IS NOT. It never travels to a supplier. Under DEC-24 a
 * supplier never learns a customer exists, and this report names customers on
 * every line — it is ours, it lives behind requireAdmin, and nothing here is
 * shaped for sending.
 */

export type BuyerShare = {
  organisation: string;
  reference: string;
  qty: number;
};

export type DemandLine = {
  skuId: string;
  skuCode: string;
  name: string;
  unitLabel: string;
  productId: string;
  /** Total across every buyer on the day. */
  qty: number;
  /** Who wanted it, biggest first. */
  buyers: BuyerShare[];
  /** Units nobody is recorded against — only ever on the despatched view. */
  unallocated: number;
  /** Which supplier this came from, on the despatched view. */
  supplier?: string;
};

export type DemandReport = {
  /** The day, as an ISO date in Asia/Dubai. */
  day: string;
  lines: DemandLine[];
  totalUnits: number;
  totalOrders: number;
};

/**
 * The UTC instants that bracket one Dubai calendar day.
 *
 * Timestamps are stored UTC and the person reading is in Dubai, so "today"
 * has to be built from their day and not from the server's. An order placed at
 * 02:00 Dubai on the 1st is 22:00 UTC on the 31st, and a naive UTC window puts
 * it in the wrong month's report — which is exactly the kind of error nobody
 * notices until an accountant does.
 */
export function dubaiDayWindow(day: string): { from: Date; to: Date } {
  const from = new Date(`${day}T00:00:00+04:00`);
  return { from, to: new Date(from.getTime() + 86_400_000) };
}

/** Today's date in Dubai, as YYYY-MM-DD. */
export function dubaiToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Biggest buyer first, then alphabetically so the order is stable. */
function sortBuyers(buyers: BuyerShare[]): BuyerShare[] {
  return [...buyers].sort(
    (a, b) => b.qty - a.qty || a.organisation.localeCompare(b.organisation)
  );
}

function finish(
  day: string,
  byItem: Map<string, DemandLine>,
  references: Set<string>
): DemandReport {
  const lines = [...byItem.values()]
    .map((line) => ({ ...line, buyers: sortBuyers(line.buyers) }))
    // Most-wanted first: the top of this list is what the day is about, and
    // an alphabetical catalogue dump buries it.
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));

  return {
    day,
    lines,
    totalUnits: lines.reduce((n, line) => n + line.qty, 0),
    totalOrders: references.size,
  };
}

/* ------------------------------------------------------------------ *
 * What customers asked for
 * ------------------------------------------------------------------ */

export async function orderedOn(day: string): Promise<DemandReport> {
  await requireAdmin("suppliers", "view");
  const { from, to } = dubaiDayWindow(day);

  const items = await db.orderItem.findMany({
    where: {
      order: { placedAt: { gte: from, lt: to } },
      // A cancelled line was never really demand. Counting it would inflate
      // the day and, worse, would put a buyer's name against something they
      // are not getting.
      status: { not: "Cancelled" },
    },
    select: {
      qty: true,
      nameSnapshot: true,
      skuCodeSnapshot: true,
      unitLabelSnapshot: true,
      skuId: true,
      sku: { select: { productMasterId: true } },
      order: {
        select: {
          reference: true,
          organisation: { select: { name: true } },
          user: { select: { name: true } },
        },
      },
    },
  });

  const byItem = new Map<string, DemandLine>();
  const references = new Set<string>();

  for (const item of items) {
    references.add(item.order.reference);

    const line =
      byItem.get(item.skuId) ??
      ({
        skuId: item.skuId,
        skuCode: item.skuCodeSnapshot,
        name: item.nameSnapshot,
        unitLabel: item.unitLabelSnapshot,
        productId: item.sku.productMasterId,
        qty: 0,
        buyers: [],
        unallocated: 0,
      } satisfies DemandLine);

    line.qty += item.qty;

    // The account, then whoever placed it, then Guest — the same precedence
    // the order screens use, so the same order is named the same way here.
    const who =
      item.order.organisation?.name ?? item.order.user?.name ?? "Guest";

    // One row per account per reference. Two lines of the same pack on one
    // order — different packs of the same product, a corrected line — are one
    // buyer wanting more, not two buyers.
    const existing = line.buyers.find(
      (b) => b.reference === item.order.reference
    );
    if (existing) existing.qty += item.qty;
    else
      line.buyers.push({
        organisation: who,
        reference: item.order.reference,
        qty: item.qty,
      });

    byItem.set(item.skuId, line);
  }

  return finish(day, byItem, references);
}

/* ------------------------------------------------------------------ *
 * What suppliers actually sent us
 * ------------------------------------------------------------------ */

/**
 * Goods in on a day, and who each unit was bought for.
 *
 * KEYED ON WHEN THE SUPPLIER DESPATCHED, not when we booked it in. The
 * question is "what did they send us today", and receiving is a separate act
 * that can happen the next morning. Where a purchase order has no dispatch
 * stamp — an older one, or a supplier who never set it — the received date
 * stands in, so goods that plainly arrived do not vanish from every day's
 * report.
 */
export async function despatchedOn(day: string): Promise<DemandReport> {
  await requireAdmin("suppliers", "view");
  const { from, to } = dubaiDayWindow(day);

  const consignments = await db.purchaseOrderDocketLine.findMany({
    where: {
      docket: { dispatchedAt: { gte: from, lt: to } },
    },
    select: {
      qty: true,
      docket: { select: { sequence: true, dispatchedAt: true } },
      purchaseOrderLine: { select: {
      skuId: true,
      nameSnapshot: true,
      skuCodeSnapshot: true,
      sku: { select: { productMasterId: true, unitLabel: true } },
      docketLines: {
        where: { docket: { dispatchedAt: { not: null } } },
        select: { qty: true, docket: { select: { sequence: true, dispatchedAt: true } } },
      },
      purchaseOrder: {
        select: { poNumber: true, supplier: { select: { companyName: true } } },
      },
      allocations: {
        orderBy: { id: "asc" },
        select: {
          qty: true,
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
      } },
    },
  });

  const byItem = new Map<string, DemandLine>();
  const references = new Set<string>();

  for (const consignment of consignments) {
    const poLine = consignment.purchaseOrderLine;
    const sending = consignment.qty;
    const previouslySent = poLine.docketLines
      .filter((line) => line.docket.dispatchedAt!.getTime() < consignment.docket.dispatchedAt!.getTime() ||
        (line.docket.dispatchedAt!.getTime() === consignment.docket.dispatchedAt!.getTime() && line.docket.sequence < consignment.docket.sequence))
      .reduce((sum, line) => sum + line.qty, 0);
    const batch = allocateConsignment(poLine.allocations, previouslySent, sending);

    const key = `${poLine.skuId}:${poLine.purchaseOrder.supplier.companyName}`;
    const line =
      byItem.get(key) ??
      ({
        skuId: poLine.skuId,
        skuCode: poLine.skuCodeSnapshot,
        name: poLine.nameSnapshot,
        unitLabel: poLine.sku.unitLabel,
        productId: poLine.sku.productMasterId,
        qty: 0,
        buyers: [],
        unallocated: 0,
        supplier: poLine.purchaseOrder.supplier.companyName,
      } satisfies DemandLine);

    line.qty += sending;

    for (const allocation of batch.allocations) {
      const order = allocation.orderItem.order;
      references.add(order.reference);

      const who = order.organisation?.name ?? order.user?.name ?? "Guest";
      const existing = line.buyers.find((b) => b.reference === order.reference);
      if (existing) existing.qty += allocation.qty;
      else
        line.buyers.push({
          organisation: who,
          reference: order.reference,
          qty: allocation.qty,
        });
    }

    // Said out loud rather than left as a gap in the arithmetic. Units bought
    // against no customer order are either stock we chose to hold or an
    // allocation that never happened, and the second is worth noticing.
    line.unallocated += batch.unallocated;

    byItem.set(key, line);
  }

  return finish(day, byItem, references);
}
