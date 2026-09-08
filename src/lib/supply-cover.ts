import "server-only";

import { db } from "./db";
import { RANKS, RANK_LABELS, rankLabel, successorTo, type Rank } from "./ranks";
import { audit, requireAdmin, type Result } from "./admin";
import type { SessionUser } from "./auth";

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

/**
 * The slots themselves live in ./ranks, which is pure and importable from a
 * browser. Re-exported here so existing callers keep working, and so there is
 * still one obvious place to look. Nothing below counts the ranks or assumes
 * which is the opposite of which — with three, there is no "the other one".
 */
export {
  RANKS,
  RANK_LABELS,
  isRank,
  rankLabel,
  rankOrder,
  type Rank,
} from "./ranks";

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
  third: { supplierId: string; supplierName: string } | null;
  /**
   * A supplier on this pack who lost the primary slot by going out of stock,
   * and has not been looked at since.
   *
   * On the row rather than left to be inferred, because the fact that needs
   * acting on is not "somebody is out of stock" — that resolves itself — but
   * "we changed who covers this without anybody here deciding to". It stays
   * until an admin sets cover on the pack, at which point it has been decided
   * either way.
   */
  demoted: {
    supplierName: string;
    rank: string;
    at: Date;
    /** Whether they are able to supply again, which is the thing to weigh. */
    backInStock: boolean;
  } | null;
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
  await requireAdmin("suppliers", "view");

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
      /*
       * Narrowed in the QUERY, unlike the gap filters below.
       *
       * Those ask "is there nobody at this rank", which is a fact about the
       * assembled row and a trap to express as a relation filter. This one
       * asks "is there somebody carrying a demotion" — a positive match the
       * database can do — and it has to be done here, because the take below
       * caps the result at a page. Filtering a queue after the cap finds only
       * the demotions that happen to fall in the first hundred packs, and
       * silently reports the rest as nothing to do.
       */
      ...(filters.missing === "demoted"
        ? { supplies: { some: { demotedAt: { not: null } } } }
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
          demotedAt: true,
          isAvailable: true,
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
      third: at("Third"),
      demoted: (() => {
        const hit = sku.supplies.find((s) => s.demotedAt !== null);
        return hit
          ? {
              supplierName: hit.supplier.companyName,
              rank: rankLabel(hit.rank),
              at: hit.demotedAt!,
              backInStock: hit.isAvailable,
            }
          : null;
      })(),
    };
  });

  // Applied after mapping because "nobody at this rank" is a fact about the
  // assembled row, and expressing it as a Prisma filter on a relation that
  // must NOT contain a match is the kind of query that silently means
  // something else.
  if (filters.missing === "primary") return rows.filter((r) => !r.primary);
  if (filters.missing === "backup") return rows.filter((r) => !r.backup);
  if (filters.missing === "third") return rows.filter((r) => !r.third);
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
  supplierId: string | null,
  buyingPriceAED?: number
): Promise<Result> {
  const actor = await requireAdmin("suppliers");

  const sku = await db.productSku.findUnique({
    where: { id: skuId },
    select: { id: true, skuCode: true },
  });
  if (!sku) return fail("That pack no longer exists.");

  const existing = await db.productSupply.findMany({
    where: { skuId },
    select: { id: true, rank: true, supplierId: true, costFils: true },
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

  const offered = existing.find(s => s.supplierId === supplierId);
  const costFils = buyingPriceAED === undefined ? offered?.costFils : Math.round(buyingPriceAED * 100);
  if (costFils == null || !Number.isSafeInteger(costFils) || costFils < 1 || (buyingPriceAED !== undefined && buyingPriceAED < 0.01)) return fail("Enter a buying price of at least AED 0.01 before assigning this supplier.");
  if (atRank && offered && offered.rank !== null && offered.rank !== rank && (atRank.costFils == null || atRank.costFils < 1)) return fail("Set the existing supplier buying price before swapping supplier positions.");

  /* 2. Already there. */
  if (atRank?.supplierId === supplierId) {
    await db.productSupply.update({ where: { id: atRank.id }, data: { costFils } });
    await audit(actor, "supply.cost", "ProductSku", skuId, { costFils: atRank.costFils }, { costFils });
    return { ok: true, value: undefined };
  }

  /* 3. THEY ARE ALREADY ON THIS PACK, somewhere.

        Either at another rank, or holding a rank of NULL because they added
        the item to their own list. Both are the same operation: move THEIR
        row to the slot being filled, and put the incumbent where the mover
        came from. It must be their existing row that moves, because
        @@unique([skuId, supplierId]) allows them only one and the paths below
        would try to give them a second.

        This was two branches while there were two ranks, one of them written
        as "they hold the other rank" — a phrase with no meaning once there is
        a third. Nothing here now names a specific rank, so a fourth slot costs
        one line in RANKS and nothing else.

        Where the mover came from may be NULL, and that is the right outcome:
        the incumbent keeps supplying the pack and stops covering it, which is
        exactly what a null rank means. Losing them altogether is a separate,
        deliberate act — clearing the slot.

        Three statements, not two: the incumbent cannot move into the slot
        being vacated while the mover still holds it, because SQLite checks the
        unique index per statement rather than at commit. */
  const theirs = existing.find((s) => s.supplierId === supplierId);

  if (theirs) {
    await db.$transaction(async (tx) => {
      if (atRank) {
        await tx.productSupply.update({
          where: { id: atRank.id },
          data: { rank: PARKED },
        });
      }
      await tx.productSupply.update({
        where: { id: theirs.id },
        // Any cover set by hand clears the demotion flag: somebody here has
        // now looked at it and decided, so the Cover screen has nothing left
        // to raise. Clearing it only on a promotion back to primary would
        // leave a permanent prompt on a demotion that was reviewed and kept.
        data: { rank, demotedAt: null, costFils },
      });
      if (atRank) {
        await tx.productSupply.update({
          where: { id: atRank.id },
          data: { rank: theirs.rank, demotedAt: null },
        });
      }
    });

    await audit(
      actor,
      theirs.rank === null ? "supply.promote" : "supply.swap",
      "ProductSku",
      skuId,
      existing,
      { rank, supplierId }
    );
    return { ok: true, value: undefined };
  }

  // A newly assigned supplier must not inherit another company's prices or
  // pending offers. Keep the incumbent's offer, without its previous rank.
  if (atRank) {
    const before = { ...atRank };
    await db.$transaction(async (tx) => {
      await tx.productSupply.update({ where: { id: atRank.id }, data: { rank: null, demotedAt: null } });
      await tx.productSupply.create({ data: {
        sku: { connect: { id: skuId } },
        supplier: { connect: { id: supplierId } },
        rank, costFils, supplyStatus: "Available", isAvailable: true,
      } });
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
      costFils,
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

/* ------------------------------------------------------------------ *
 * Cover for one product
 * ------------------------------------------------------------------ */

/**
 * Cover is held per PACK, but it is chosen per PRODUCT.
 *
 * ProductSupply hangs off a SKU, because a supplier's cost and part number are
 * for a specific pack — the box and the carton are different lines on their
 * price list. Nobody allocates a supplier a box and somebody else the carton
 * of the same glove, though, and since the variant matrix landed a product can
 * carry thirty packs. Asking an admin to set the same supplier thirty times is
 * how a product ends up half covered by one and half by another.
 *
 * So the product page decides, and every pack follows.
 */

export type CoverCandidate = {
  supplierId: string;
  companyName: string;
  /** How many of the product's packs they have put on their own list. */
  offeredPacks: number;
  /** True when they already cover at least one pack of this product. */
  covers: boolean;
};

export type ProductCover = {
  /** Active packs the product sells. */
  totalPacks: number;
  /** One entry per slot in RANKS, in the buying run's order of preference. */
  slots: { rank: Rank; label: string; held: HeldRank }[];
  candidates: CoverCandidate[];
};

/**
 * Who holds a rank across the product, and on how many of its packs.
 *
 * `mixed` is the case worth naming: two suppliers holding the same rank on
 * different packs of one product. It is legal, it happens when cover is set
 * pack by pack or arrives from an import, and a control that showed only the
 * first would quietly overwrite the others.
 */
export type HeldRank =
  | { kind: "none" }
  | { kind: "all"; supplierId: string; companyName: string; packs: number }
  | { kind: "some"; supplierId: string; companyName: string; packs: number }
  | { kind: "mixed"; holders: { companyName: string; packs: number }[] };

function heldRank(
  rows: { supplierId: string; companyName: string }[],
  totalPacks: number
): HeldRank {
  if (rows.length === 0) return { kind: "none" };

  const bySupplier = new Map<string, { companyName: string; packs: number }>();
  for (const row of rows) {
    const seen = bySupplier.get(row.supplierId);
    if (seen) seen.packs += 1;
    else bySupplier.set(row.supplierId, { companyName: row.companyName, packs: 1 });
  }

  if (bySupplier.size > 1) {
    return {
      kind: "mixed",
      holders: [...bySupplier.values()].sort((a, b) => b.packs - a.packs),
    };
  }

  const [supplierId, only] = [...bySupplier.entries()][0];
  return {
    kind: only.packs >= totalPacks ? "all" : "some",
    supplierId,
    companyName: only.companyName,
    packs: only.packs,
  };
}

/**
 * The cover on one product, and who may be given it.
 *
 * CANDIDATES ARE ONLY SUPPLIERS WHO CARRY THE ITEM. A supplier appears here
 * because they put this product on their own list, or because they already
 * cover it — never merely because they exist. Allocating a purchase order to a
 * company that has not said they stock the thing is how an order sits unfilled
 * for a week before anybody asks why.
 *
 * An offer still waiting on approval is not a candidate. Accepting it is a
 * decision of its own, made on the approvals screen; it should not happen as a
 * side effect of choosing a primary.
 */
export async function productCover(
  productMasterId: string
): Promise<ProductCover> {
  await requireAdmin("suppliers", "view");

  const skus = await db.productSku.findMany({
    where: { productMasterId, isActive: true },
    select: {
      id: true,
      supplies: {
        select: {
          supplierId: true,
          rank: true,
          isApproved: true,
          supplier: { select: { companyName: true } },
        },
      },
    },
  });

  const totalPacks = skus.length;
  const rows = skus.flatMap((s) =>
    s.supplies.map((supply) => ({
      supplierId: supply.supplierId,
      companyName: supply.supplier.companyName,
      rank: supply.rank,
      isApproved: supply.isApproved,
    }))
  );

  const allSuppliers = await db.supplier.findMany({ where: { status: { not: "Archived" } }, select: { id: true, companyName: true } });
  const candidates = new Map<string, CoverCandidate>(allSuppliers.map(supplier => [supplier.id, {
    supplierId: supplier.id, companyName: supplier.companyName, offeredPacks: 0, covers: false,
  }]));
  for (const row of rows) {
    // An unapproved offer is not yet a relationship — see the note above.
    if (!row.isApproved && row.rank === null) continue;

    const seen = candidates.get(row.supplierId);
    if (seen) {
      seen.offeredPacks += 1;
      seen.covers ||= row.rank !== null;
    } else {
      candidates.set(row.supplierId, {
        supplierId: row.supplierId,
        companyName: row.companyName,
        offeredPacks: 1,
        covers: row.rank !== null,
      });
    }
  }

  return {
    totalPacks,
    // Derived from RANKS rather than written out, so a fourth slot appears on
    // the screen without anybody remembering to add it here.
    slots: RANKS.map((rank) => ({
      rank,
      label: RANK_LABELS[rank],
      held: heldRank(
        rows.filter((r) => r.rank === rank),
        totalPacks
      ),
    })),
    candidates: [...candidates.values()].sort((a, b) =>
      a.companyName.localeCompare(b.companyName)
    ),
  };
}

export type ProductCoverOutcome = {
  changed: number;
  /** Packs the supplier does not carry, so cover was not forced onto them. */
  notOffered: number;
  skipped: { skuCode: string; why: string }[];
};

/**
 * Put a supplier at a rank across a whole product, or clear that rank.
 *
 * Only on the packs they actually carry. A supplier who has added the box but
 * not the carton covers the box, and the carton is reported back rather than
 * silently assigned — an allocation nobody asked for is worse than a gap
 * somebody can see.
 */
export async function setProductCover(
  productMasterId: string,
  rank: Rank,
  supplierId: string | null,
  buyingPrices?: Record<string, number>
): Promise<Result<ProductCoverOutcome>> {
  await requireAdmin("suppliers");

  const skus = await db.productSku.findMany({
    where: { productMasterId, isActive: true },
    select: { id: true, skuCode: true, supplies: { select: { supplierId: true, isApproved: true, rank: true } } },
  });

  if (skus.length === 0) return fail("That product has no active packs.");

  if (supplierId && !await db.supplier.findFirst({ where: { id: supplierId, status: { not: "Archived" } }, select: { id: true } })) return fail("Choose a current supplier.");
  if (supplierId && buyingPrices && skus.some(sku => !Number.isFinite(buyingPrices[sku.id]) || buyingPrices[sku.id] < 0.01)) return fail("Enter a buying price of at least AED 0.01 for every active pack.");
  const targets = skus;

  const skipped: ProductCoverOutcome["skipped"] = [];
  let changed = 0;

  for (const sku of targets) {
    const result = await setCover(sku.id, rank, supplierId, buyingPrices?.[sku.id]);
    if (result.ok) changed += 1;
    else skipped.push({ skuCode: sku.skuCode, why: result.error });
  }

  return {
    ok: true,
    value: { changed, notOffered: skus.length - targets.length, skipped },
  };
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
  await requireAdmin("suppliers");

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

/**
 * A supplier losing the primary slot by telling us they are out of stock.
 *
 * WHY THE RANK MOVES AT ALL, when the buying run already skips them: the run
 * routes around an out-of-stock primary today, so the order goes to the right
 * company either way. What it does not do is leave a mark. The pack still says
 * this supplier is our first call, the badge in their portal still says
 * Primary, and the Cover screen still shows an arrangement that has not been
 * true for a month. This makes the record follow what actually happened.
 *
 * IT DOES NOT REVERSE ITSELF. Coming back into stock does not take the slot
 * back — that is a decision somebody here makes, at the client's request, and
 * demotedAt is what lets the Cover screen offer it. A demotion that undid
 * itself would say nothing to anybody.
 *
 * NOBODY TO PROMOTE MEANS NOBODY IS DEMOTED. Fourteen of the covered packs have
 * a primary and no backup at all; taking the rank away there would leave a pack
 * with no cover, which is worse than the thing being fixed.
 *
 * Called by the supplier's own actions rather than by an admin, so it takes the
 * actor rather than demanding one — requireAdmin here would refuse the only
 * caller there is.
 */
export type Demotion = {
  /** Who took the primary slot. Null when nothing changed. */
  promotedTo: string | null;
  /** Said to the supplier, so the consequence is not a surprise later. */
  message: string | null;
};

export async function demoteOutOfStockPrimary(
  supplyId: string,
  actor: { id: string; name: string; email?: string | null }
): Promise<Demotion> {
  const supply = await db.productSupply.findUnique({
    where: { id: supplyId },
    select: { id: true, skuId: true, rank: true, supplierId: true },
  });

  const nothing: Demotion = { promotedTo: null, message: null };
  if (!supply || supply.rank !== "Primary") return nothing;

  const cover = await db.productSupply.findMany({
    where: { skuId: supply.skuId, rank: { not: null } },
    select: {
      id: true,
      rank: true,
      isAvailable: true,
      supplier: {
        select: { id: true, companyName: true, isAvailable: true, status: true },
      },
    },
  });

  const successor = successorTo(
    "Primary",
    cover.map((row) => ({
      ...row,
      // The same two facts the buying run insists on: the company open, and
      // the item available from them. Promoting a retired supplier would put
      // the pack in a worse position than leaving it alone.
      canSupply:
        row.isAvailable &&
        row.supplier.isAvailable &&
        row.supplier.status === "Active",
    }))
  );

  if (!successor) {
    return {
      promotedTo: null,
      message:
        "You are still our primary supplier for this item — there is nobody else on it. We will be in touch.",
    };
  }

  /*
   * Three statements, not two, and the same reason as setCover: SQLite checks
   * the unique index per statement rather than at commit, so the incumbent
   * cannot move into a slot the other row still holds.
   */
  await db.$transaction(async (tx) => {
    await tx.productSupply.update({
      where: { id: supply.id },
      data: { rank: PARKED },
    });
    await tx.productSupply.update({
      where: { id: successor.id },
      data: {
        rank: "Primary",
        // Whatever brought them down before, they are back up now.
        demotedAt: null,
      },
    });
    await tx.productSupply.update({
      where: { id: supply.id },
      data: { rank: successor.rank, demotedAt: new Date() },
    });
  });

  await audit(
    actor as SessionUser,
    "supply.demote.outOfStock",
    "ProductSupply",
    supply.id,
    { rank: "Primary" },
    { rank: successor.rank, promotedTo: successor.supplier.companyName }
  );

  return {
    promotedTo: successor.supplier.companyName,
    /*
     * successor.rank is what THEY drop to, not what the successor becomes —
     * the successor takes Primary. Written the other way round first, which
     * told a supplier who had just been demoted that they were still our
     * primary; only running it showed that up.
     *
     * The company taking over is deliberately not named. It is another
     * supplier's commercial position on a line they compete for, and there is
     * no version of telling them that which helps us.
     */
    message: `Marked out of stock. Another supplier now takes this item first, and you are our ${rankLabel(successor.rank).toLowerCase()} for it until we say otherwise.`,
  };
}
