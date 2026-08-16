/**
 * Turning a day's unpurchased customer lines into purchase orders — DEC-26.
 *
 * Pure, so the rule that decides who gets an order can be tested without a
 * database, the same split as query.ts against catalog.ts. The caller in
 * purchasing.ts supplies the demand and writes the result.
 *
 * The shape of the problem: customers order a few units at a time, all day,
 * from a catalogue where each item has a primary supplier and a backup. At the
 * cutoff this pools that demand — one order per supplier, one line per item,
 * quantities summed — so a supplier receives an order for fifty boxes of gloves
 * rather than eleven orders for gloves. Pooling is the point; it is what makes
 * the quantities worth pricing.
 */

export type SupplyRank = "Primary" | "Backup";

export type SupplyOption = {
  supplierId: string;
  supplierName: string;
  rank: SupplyRank;
  /**
   * The supplier can supply this item right now. Two separate facts collapse
   * into this: the company being open for business at all, and this particular
   * item being available from them. Either one false makes the option
   * unusable — see DEC-25.
   */
  available: boolean;
  costFils: number | null;
  supplierPartNumber: string | null;
};

/** One customer's outstanding need for one SKU. */
export type DemandLine = {
  orderItemId: string;
  skuId: string;
  skuCode: string;
  name: string;
  /** Units still to be bought — an order line partly bought is partly here. */
  qty: number;
  supplies: SupplyOption[];
};

export type PlannedAllocation = { orderItemId: string; qty: number };

export type PlannedLine = {
  skuId: string;
  skuCode: string;
  name: string;
  qtyOrdered: number;
  unitCostFils: number | null;
  supplierPartNumber: string | null;
  /** This line is not with the first choice, so a reviewer can see it. */
  wasFallback: boolean;
  /** Which customers' units make up the quantity. Never leaves our side. */
  allocations: PlannedAllocation[];
};

export type PlannedOrder = {
  supplierId: string;
  supplierName: string;
  lines: PlannedLine[];
  /** Null when any line has no recorded cost — a total that quietly treats
   *  unknown as zero is worse than no total. */
  totalCostFils: number | null;
};

export type UnsourceableLine = {
  orderItemId: string;
  skuId: string;
  skuCode: string;
  name: string;
  qty: number;
  reason: string;
};

export type PurchasePlan = {
  orders: PlannedOrder[];
  /**
   * Lines neither supplier can cover. These must be surfaced, never dropped:
   * a customer is waiting on every one, and silently leaving them off a
   * purchase order is how an order sits for a week with nobody noticing.
   */
  unsourceable: UnsourceableLine[];
};

/* ------------------------------------------------------------------ *
 * Receiving
 * ------------------------------------------------------------------ */

export type ReservedAllocation = {
  allocationId: string;
  /** Units reserved for this customer when the purchase order was raised. */
  qty: number;
  /** When the customer ordered. Decides who is served first if stock is short. */
  placedAt: number;
};

export type FilledAllocation = {
  allocationId: string;
  /** Units this customer actually gets. Zero means they wait for the next order. */
  filled: number;
  shortfall: number;
};

/**
 * Sharing out what actually turned up — BE-37.
 *
 * Suppliers under-deliver. Ten ordered for three clinics and seven arrive, and
 * something has to decide who waits. The rule is the one a person would defend
 * in a phone call: whoever ordered first is served first, in full, and the
 * shortfall lands on the most recent order rather than being spread thinly so
 * that nobody receives a usable quantity.
 *
 * A part-filled reservation keeps only what arrived; the remainder stops being
 * reserved and returns to outstanding demand, which is what puts it on the next
 * purchase order automatically.
 */
export function allocateReceipt(
  received: number,
  reserved: ReservedAllocation[]
): FilledAllocation[] {
  let remaining = Math.max(0, received);

  return [...reserved]
    // Earliest order first; the allocation id breaks ties so two orders placed
    // in the same millisecond still share out the same way every time.
    .sort((a, b) => a.placedAt - b.placedAt || a.allocationId.localeCompare(b.allocationId))
    .map((allocation) => {
      const filled = Math.min(allocation.qty, remaining);
      remaining -= filled;
      return {
        allocationId: allocation.allocationId,
        filled,
        shortfall: allocation.qty - filled,
      };
    });
}

/** Primary if it can supply, otherwise backup, otherwise nothing. */
export function chooseSupply(supplies: SupplyOption[]): SupplyOption | null {
  const usable = supplies.filter((s) => s.available);
  return (
    usable.find((s) => s.rank === "Primary") ??
    usable.find((s) => s.rank === "Backup") ??
    null
  );
}

function reasonFor(supplies: SupplyOption[]): string {
  if (supplies.length === 0) return "No supplier is recorded for this item.";
  const names = supplies.map((s) => `${s.supplierName} (${s.rank.toLowerCase()})`);
  return `Neither supplier can supply it: ${names.join(" and ")} are both unavailable.`;
}

export function planPurchaseOrders(demand: DemandLine[]): PurchasePlan {
  const bySupplier = new Map<string, { name: string; lines: Map<string, PlannedLine> }>();
  const unsourceable: UnsourceableLine[] = [];

  for (const line of demand) {
    if (line.qty <= 0) continue;

    const supply = chooseSupply(line.supplies);
    if (!supply) {
      unsourceable.push({
        orderItemId: line.orderItemId,
        skuId: line.skuId,
        skuCode: line.skuCode,
        name: line.name,
        qty: line.qty,
        reason: reasonFor(line.supplies),
      });
      continue;
    }

    const order =
      bySupplier.get(supply.supplierId) ??
      { name: supply.supplierName, lines: new Map<string, PlannedLine>() };
    bySupplier.set(supply.supplierId, order);

    const existing = order.lines.get(line.skuId);
    if (existing) {
      existing.qtyOrdered += line.qty;
      existing.allocations.push({ orderItemId: line.orderItemId, qty: line.qty });
    } else {
      order.lines.set(line.skuId, {
        skuId: line.skuId,
        skuCode: line.skuCode,
        name: line.name,
        qtyOrdered: line.qty,
        unitCostFils: supply.costFils,
        supplierPartNumber: supply.supplierPartNumber,
        wasFallback: supply.rank === "Backup",
        allocations: [{ orderItemId: line.orderItemId, qty: line.qty }],
      });
    }
  }

  // Sorted so building the same demand twice produces the same documents —
  // a purchase order whose line order shuffles between runs is impossible to
  // check against the one you sent yesterday.
  const orders: PlannedOrder[] = [...bySupplier.entries()]
    .map(([supplierId, { name, lines }]) => {
      const sorted = [...lines.values()].sort((a, b) =>
        a.skuCode.localeCompare(b.skuCode)
      );
      const anyUnknownCost = sorted.some((l) => l.unitCostFils === null);
      return {
        supplierId,
        supplierName: name,
        lines: sorted,
        totalCostFils: anyUnknownCost
          ? null
          : sorted.reduce((sum, l) => sum + (l.unitCostFils ?? 0) * l.qtyOrdered, 0),
      };
    })
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName));

  unsourceable.sort((a, b) => a.skuCode.localeCompare(b.skuCode));

  return { orders, unsourceable };
}
