import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";

/**
 * Price changes suppliers have asked for, and nobody has agreed to yet.
 *
 * A supplier can describe their own goods — part number, lead time, whether
 * they have any in — and all of that takes effect the moment they save it.
 * What we PAY them is different in kind: it is a term between two companies,
 * and a company that can change it unilaterally on a web form does not have an
 * agreement, it has a price list.
 *
 * So ProductSupply carries the agreed cost and the asked-for cost in separate
 * columns, and this is the queue that turns the second into the first. Until
 * somebody here decides, every purchase order, margin figure and buying
 * decision uses the agreed price, which is the whole point of the split.
 *
 * REJECTION NEEDS A REASON. A supplier told only "no" has nothing to act on,
 * and the next thing that happens is a phone call to find out why.
 */

const fail = (error: string): Result<never> => ({ ok: false, error });

export type PriceRequest = {
  supplyId: string;
  supplierId: string;
  supplierName: string;
  skuCode: string;
  productName: string;
  unitLabel: string;
  /** What we pay today. Null where none was ever recorded. */
  agreedFils: number | null;
  /** What they are asking for. */
  proposedFils: number;
  reason: string | null;
  proposedByName: string | null;
  proposedAt: Date;
  /** Primary | Backup | null — how much this line actually matters. */
  rank: string | null;
  /** Percentage movement, positive for an increase. Null with no agreed cost. */
  changePercent: number | null;
};

function percentChange(from: number | null, to: number): number | null {
  if (from === null || from === 0) return null;
  return Math.round(((to - from) / from) * 1000) / 10;
}

/** Everything outstanding, oldest first — a request waiting three weeks is
 *  the one somebody needs to see, not the one filed this morning. */
export async function pendingPriceRequests(): Promise<PriceRequest[]> {
  await requireAdmin("suppliers", "view");

  const rows = await db.productSupply.findMany({
    where: { proposedCostFils: { not: null } },
    orderBy: { proposedAt: "asc" },
    select: {
      id: true,
      supplierId: true,
      rank: true,
      costFils: true,
      proposedCostFils: true,
      proposedReason: true,
      proposedByName: true,
      proposedAt: true,
      supplier: { select: { companyName: true } },
      sku: {
        select: {
          skuCode: true,
          unitLabel: true,
          product: { select: { name: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    supplyId: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplier.companyName,
    skuCode: row.sku.skuCode,
    productName: row.sku.product.name,
    unitLabel: row.sku.unitLabel,
    agreedFils: row.costFils,
    proposedFils: row.proposedCostFils!,
    reason: row.proposedReason,
    proposedByName: row.proposedByName,
    proposedAt: row.proposedAt ?? new Date(0),
    rank: row.rank,
    changePercent: percentChange(row.costFils, row.proposedCostFils!),
  }));
}

/** How many are waiting, for the attention counts. Cheap, and no admin
 *  check — the screens that show it are already behind one. */
export async function pendingPriceRequestCount(): Promise<number> {
  return db.productSupply.count({ where: { proposedCostFils: { not: null } } });
}

const CLEARED = {
  proposedCostFils: null,
  proposedReason: null,
  proposedAt: null,
  proposedByName: null,
};

/**
 * Accept a requested price. The asked-for figure becomes the agreed one.
 *
 * NOT RETROSPECTIVE. Purchase orders already raised keep the price they were
 * raised at — they are a record of what was agreed at the time, and rewriting
 * them would change documents a supplier has already been sent.
 */
export async function approvePriceRequest(supplyId: string): Promise<Result> {
  const actor = await requireAdmin("suppliers");

  const supply = await db.productSupply.findUnique({
    where: { id: supplyId },
    select: {
      id: true,
      costFils: true,
      proposedCostFils: true,
      proposedReason: true,
      sku: { select: { skuCode: true } },
    },
  });
  if (!supply) return fail("That supply line no longer exists.");
  if (supply.proposedCostFils === null) {
    return fail("There is no price request on that line.");
  }

  await db.productSupply.update({
    where: { id: supplyId },
    data: { costFils: supply.proposedCostFils, ...CLEARED },
  });

  await audit(
    actor,
    "supply.price.approve",
    "ProductSupply",
    supply.sku.skuCode,
    { costFils: supply.costFils, proposedCostFils: supply.proposedCostFils },
    { costFils: supply.proposedCostFils }
  );

  return { ok: true, value: undefined };
}

/**
 * Refuse a requested price. The agreed cost is untouched.
 *
 * The reason is required, and it is stored on the audit entry rather than on
 * the row, because the row goes back to having no request at all — there is
 * nothing left for it to hang off. The supplier is free to ask again.
 */
export async function rejectPriceRequest(
  supplyId: string,
  note: string
): Promise<Result> {
  const actor = await requireAdmin("suppliers");

  const reason = note.trim();
  if (reason.length < 3) {
    return fail("Say why, so the supplier has something to answer.");
  }

  const supply = await db.productSupply.findUnique({
    where: { id: supplyId },
    select: {
      id: true,
      costFils: true,
      proposedCostFils: true,
      sku: { select: { skuCode: true } },
    },
  });
  if (!supply) return fail("That supply line no longer exists.");
  if (supply.proposedCostFils === null) {
    return fail("There is no price request on that line.");
  }

  await db.productSupply.update({ where: { id: supplyId }, data: CLEARED });

  await audit(
    actor,
    "supply.price.reject",
    "ProductSupply",
    supply.sku.skuCode,
    { proposedCostFils: supply.proposedCostFils },
    { costFils: supply.costFils, decisionNote: reason }
  );

  return { ok: true, value: undefined };
}
