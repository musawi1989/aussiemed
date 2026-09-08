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

/**
 * The cover slots, in the order this run tries them.
 *
 * One list, in ./ranks, shared with the admin screens and the cover service.
 * It was briefly duplicated here on the reasoning that this module is pure and
 * supply-cover.ts is not — but ./ranks is pure too, and two lists of ranks
 * drifting apart fails silently: the symptom is "the third supplier never
 * receives an order", which nothing reports.
 */
import { RANKS, type Rank } from "./ranks.ts";

export {
  RANKS as SUPPLY_RANKS,
  isRank as isSupplyRank,
  type Rank as SupplyRank,
} from "./ranks.ts";

export type SupplyOption = {
  supplierId: string;
  supplierName: string;
  rank: Rank;
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

/**
 * The first slot that can actually supply, in order of preference.
 *
 * Written as a walk over SUPPLY_RANKS rather than a chain of finds, so adding
 * a slot does not mean remembering to add another line here — the bug that
 * would follow is silent, and reads as "the third supplier is never used".
 */
export function chooseSupply(supplies: SupplyOption[]): SupplyOption | null {
  const usable = supplies.filter((s) => s.available);

  for (const rank of RANKS) {
    const found = usable.find((s) => s.rank === rank);
    if (found) return found;
  }
  return null;
}

function reasonFor(supplies: SupplyOption[]): string {
  if (supplies.length === 0) return "No supplier is recorded for this item.";

  const names = supplies.map((s) => `${s.supplierName} (${s.rank.toLowerCase()})`);

  // "Neither" was correct while there were two slots and wrong the moment
  // there were three. The count decides the word.
  if (names.length === 1) {
    return `${names[0]} cannot supply it, and there is no other supplier on this item.`;
  }
  const listed = `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `No supplier can supply it: ${listed} are all unavailable.`;
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
        // Anything but the primary is a fallback. Written as "not Primary"
        // rather than "is Backup" so a third-choice order is still flagged as
        // one we did not intend to place.
        wasFallback: supply.rank !== "Primary",
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
