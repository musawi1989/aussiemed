import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";

/**
 * Who covers what: the primary and backup supplier on every pack we sell.
 *
 * The ranks existed from the start — ProductSupply.rank is Primary or Backup,
 * one of each per SKU — but nothing in the admin could SET them. They arrived
 * with a catalogue import and could only be changed by importing again, which
 * is a poor way to move one line to a different supplier and no way at all to
 * move forty. This is the screen that was missing.
 *
 * IT IS NOT VISIBLE TO SUPPLIERS. A supplier does not learn from us whether
 * they are the primary or the backup on an item — see the note in
 * listMySupplies. The rank governs who receives a purchase order, and that is
 * AussieMed's commercial position, not a status to be published.
 *
 * TWO DATABASE CONSTRAINTS SHAPE EVERYTHING HERE, and both are worth stating
 * because they are what makes the obvious implementation wrong:
 *
 *   @@unique([skuId, rank])       one Primary and one Backup per SKU
 *   @@unique([skuId, supplierId]) a supplier appears at most once per SKU
 *
 * Together they mean "make X the primary" is four different operations
 * depending on where X already stands, and one of them is a swap that cannot
 * be written as two updates without momentarily breaking a constraint.
 */

const fail = (error: string): Result<never> => ({ ok: false, error });

export const RANKS = ["Primary", "Backup"] as const;
export type Rank = (typeof RANKS)[number];

export function isRank(value: string): value is Rank {
  return (RANKS as readonly string[]).includes(value);
}

/** The other one. */
const other = (rank: Rank): Rank => (rank === "Primary" ? "Backup" : "Primary");

/**
 * A rank no row is ever left holding.
 *
 * Swapping two rows' ranks inside a transaction needs somewhere to park one of
 * them: setting the incumbent straight to Backup would collide with the row
 * that is already Backup, and SQLite checks the unique index per statement,
 * not at commit. Nothing outside this module ever writes or reads it, and no
 * row can still hold it once the transaction returns.
 */
const PARKED = "__swapping";

export type CoverFilters = {
  /** Product name, SKU code or the supplier's own part number. */
  q?: string;
  /** Only SKUs this supplier covers, at either rank. */
  supplierId?: string;
  /** "primary" | "backup" — SKUs with nobody at that rank. */
  missing?: string;
  categoryId?: string;
};

export type CoverRow = {
  skuId: string;
  skuCode: string;
  unitLabel: string | null;
  productName: string;
  categoryName: string | null;
  primary: { supplierId: string; supplierName: string } | null;
  backup: { supplierId: string; supplierName: string } | null;
};

/**
 * The SKUs and who covers them.
 *
 * Capped, and the cap is the caller's. This is a screen for working through
 * cover a page at a time, not a report.
 */
export async function listCover(
  filters: CoverFilters,
  take = 100
): Promise<CoverRow[]> {
  await requireAdmin();

  const term = filters.q?.trim();

  const skus = await db.productSku.findMany({
    where: {
      ...(term
        ? {
            OR: [
              { skuCode: { contains: term } },
              { product: { is: { name: { contains: term } } } },
              { supplies: { some: { supplierPartNumber: { contains: term } } } },
            ],
          }
        : {}),
      ...(filters.supplierId
        ? { supplies: { some: { supplierId: filters.supplierId } } }
        : {}),
      ...(filters.categoryId
        ? {
            product: {
              is: {
                categories: { some: { categoryId: filters.categoryId } },
              },
            },
          }
        : {}),
    },
    orderBy: [{ product: { name: "asc" } }, { skuCode: "asc" }],
    take,
    select: {
      id: true,
      skuCode: true,
      unitLabel: true,
      product: {
        select: {
          name: true,
          categories: {
            select: { category: { select: { name: true } } },
          },
        },
      },
      supplies: {
        select: {
          rank: true,
          supplierId: true,
          supplier: { select: { companyName: true } },
        },
      },
    },
  });

  const rows = skus.map((sku) => {
    const at = (rank: Rank) => {
      const hit = sku.supplies.find((s) => s.rank === rank);
      return hit
        ? { supplierId: hit.supplierId, supplierName: hit.supplier.companyName }
        : null;
    };
    return {
      skuId: sku.id,
      skuCode: sku.skuCode,
      unitLabel: sku.unitLabel,
      productName: sku.product.name,
      // The deepest category is the specific one, same rule the saved-products
      // list follows: "Gloves" is what a person browses by.
      categoryName: sku.product.categories.at(-1)?.category.name ?? null,
      primary: at("Primary"),
      backup: at("Backup"),
    };
  });

  // Applied after mapping because "nobody at this rank" is a fact about the
  // assembled row, and expressing it as a Prisma filter on a relation that
  // must NOT contain a match is the kind of query that silently means
  // something else.
  if (filters.missing === "primary") return rows.filter((r) => !r.primary);
  if (filters.missing === "backup") return rows.filter((r) => !r.backup);
  return rows;
}

/**
 * Put a supplier at a rank on one SKU, or clear the rank entirely.
 *
 * Four cases, and the comments say which is which because the shape of the
 * code does not.
 */
export async function setCover(
  skuId: string,
  rank: Rank,
  supplierId: string | null
): Promise<Result> {
  const actor = await requireAdmin();

  const sku = await db.productSku.findUnique({
    where: { id: skuId },
    select: { id: true, skuCode: true },
  });
  if (!sku) return fail("That pack no longer exists.");

  const existing = await db.productSupply.findMany({
    where: { skuId },
    select: { id: true, rank: true, supplierId: true },
  });
  const atRank = existing.find((s) => s.rank === rank) ?? null;

  /* 1. Clearing. The row goes; the supplier's cost and part number go with it,
        which is correct — they described a relationship that no longer exists.
        Clearing a rank nobody holds is a no-op rather than an error. */
  if (!supplierId) {
    if (!atRank) return { ok: true, value: undefined };
    await db.productSupply.delete({ where: { id: atRank.id } });
    await audit(actor, "supply.clear", "ProductSku", skuId, atRank, null);
    return { ok: true, value: undefined };
  }

  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, companyName: true },
  });
  if (!supplier) return fail("That supplier no longer exists.");

  /* 2. Already there. */
  if (atRank?.supplierId === supplierId) return { ok: true, value: undefined };

  const atOther = existing.find(
    (s) => s.rank === other(rank) && s.supplierId === supplierId
  );

  /* 3. A SWAP. They already hold the other rank on this pack, so this is a
        promotion or a demotion, not a new arrangement — and their cost and
        part number must travel with them, which means moving RANKS rather
        than supplier ids.

        Three statements, not two, because the incumbent cannot go straight to
        the rank being vacated while the vacating row still holds it. */
  if (atOther) {
    await db.$transaction(async (tx) => {
      if (atRank) {
        await tx.productSupply.update({
          where: { id: atRank.id },
          data: { rank: PARKED },
        });
      }
      await tx.productSupply.update({
        where: { id: atOther.id },
        data: { rank },
      });
      if (atRank) {
        await tx.productSupply.update({
          where: { id: atRank.id },
          data: { rank: other(rank) },
        });
      }
    });

    await audit(actor, "supply.swap", "ProductSku", skuId, existing, {
      rank,
      supplierId,
    });
    return { ok: true, value: undefined };
  }

  /* 4. Somebody else holds the rank, or nobody does. Move the existing row to
        the new supplier rather than deleting and recreating: cost and part
        number belong to the supplier, so they are cleared deliberately here —
        what supplier A charged is not what supplier B charges, and carrying it
        over would put a wrong cost on a margin report. */
  if (atRank) {
    const before = { ...atRank };
    await db.productSupply.update({
      where: { id: atRank.id },
      data: { supplierId, costFils: null, supplierPartNumber: null },
    });
    await audit(actor, "supply.reassign", "ProductSku", skuId, before, {
      rank,
      supplierId,
    });
    return { ok: true, value: undefined };
  }

  // Relations connected rather than scalar ids: this client rejects the
  // unchecked form on create with "Argument sku is missing". Typecheck was
  // happy with the scalars, so only running it found this.
  await db.productSupply.create({
    data: {
      sku: { connect: { id: skuId } },
      supplier: { connect: { id: supplierId } },
      rank,
      supplyStatus: "Available",
      isAvailable: true,
    },
  });
  await audit(actor, "supply.assign", "ProductSku", skuId, null, {
    rank,
    supplierId,
  });
  return { ok: true, value: undefined };
}

export type BulkOutcome = {
  changed: number;
  skipped: { skuCode: string; why: string }[];
};

/**
 * The same change across many packs.
 *
 * Runs one at a time rather than as a single statement, because each pack is a
 * different one of the four cases above. It REPORTS WHAT IT SKIPPED rather
 * than counting it as done: a bulk action that says "40 updated" when eleven
 * of them failed is worse than one that says "29 updated, 11 skipped" and
 * names them.
 */
export async function bulkSetCover(
  skuIds: string[],
  rank: Rank,
  supplierId: string | null
): Promise<Result<BulkOutcome>> {
  await requireAdmin();

  if (skuIds.length === 0) return fail("Nothing was selected.");
  if (skuIds.length > 500) {
    return fail("That is more than 500 packs. Narrow the filters first.");
  }

  const codes = new Map(
    (
      await db.productSku.findMany({
        where: { id: { in: skuIds } },
        select: { id: true, skuCode: true },
      })
    ).map((s) => [s.id, s.skuCode])
  );

  const skipped: BulkOutcome["skipped"] = [];
  let changed = 0;

  for (const skuId of skuIds) {
    const result = await setCover(skuId, rank, supplierId);
    if (result.ok) changed += 1;
    else skipped.push({ skuCode: codes.get(skuId) ?? skuId, why: result.error });
  }

  return { ok: true, value: { changed, skipped } };
}
