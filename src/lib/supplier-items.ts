import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";
import { parseCostToFils } from "./supply-terms";

/**
 * Putting an item on a supplier's list from our side.
 *
 * THE SAME JOB FROM THE OTHER END. A supplier can already say what they stock
 * from their own portal, and the Cover screen already picks who supplies a
 * given pack. What was missing was the supplier-first version: sitting with a
 * new supplier's price list and entering the forty things they carry, without
 * opening forty product pages to do it.
 *
 * WHAT IT CREATES IS AN OFFER, NOT COVER. The new row has a null rank, which
 * means "this supplier can supply this pack" and nothing more — it receives no
 * purchase order, because the buying run reads Primary, Backup and Third and
 * excludes nulls. Who we actually buy from stays one decision in one place, on
 * Suppliers → Cover, and adding forty items to a supplier must not quietly
 * appoint them to any of it.
 *
 * isApproved is true: an admin adding a supplier's own price list is not a
 * thing an admin then has to approve. The unapproved state exists for a
 * supplier adding themselves while approvals are on.
 */

const fail = (error: string): Result<never> => ({ ok: false, error });

export type SupplierPack = {
  skuId: string;
  skuCode: string;
  name: string;
  unitLabel: string;
  categoryName: string | null;
  image: string | null;
  imageAlt: string | null;
  /** Already on this supplier's list, so the row says so instead of Add. */
  alreadyTheirs: boolean;
};

/**
 * The catalogue, marking what this supplier already has.
 *
 * Rows they already supply STAY in the list, marked, for the reason the
 * supplier's own version records: Next re-renders after a server action, so a
 * row that vanished the instant it was added took its confirmation with it and
 * a narrow search emptied entirely, which reads as a failure.
 */
export async function packsForSupplier(
  supplierId: string,
  filters: { q?: string; categoryId?: string }
): Promise<SupplierPack[]> {
  await requireAdmin("suppliers", "view");

  const term = filters.q?.trim();

  const skus = await db.productSku.findMany({
    where: {
      // Only what is actually on sale. Cover on a pack nobody can buy is cover
      // on nothing — the lesson from the supplier-list clean-up (CHG-24), and
      // the same two conditions the portal uses to decide what is listed.
      isActive: true,
      product: {
        is: {
          status: "Active",
          ...(filters.categoryId
            ? { categories: { some: { categoryId: filters.categoryId } } }
            : {}),
          ...(term ? { name: { contains: term } } : {}),
        },
      },
    },
    orderBy: [{ product: { name: "asc" } }, { skuCode: "asc" }],
    take: 60,
    select: {
      id: true,
      skuCode: true,
      unitLabel: true,
      supplies: { where: { supplierId }, select: { id: true }, take: 1 },
      product: {
        select: {
          name: true,
          categories: { select: { category: { select: { name: true } } } },
          images: {
            orderBy: { sortOrder: "asc" },
            take: 1,
            select: { path: true, altText: true },
          },
        },
      },
    },
  });

  return skus.map((sku) => ({
    skuId: sku.id,
    skuCode: sku.skuCode,
    name: sku.product.name,
    unitLabel: sku.unitLabel,
    // The deepest category is the specific one — "Gloves", not "Medical
    // Consumables".
    categoryName: sku.product.categories.at(-1)?.category.name ?? null,
    image: sku.product.images[0]?.path ?? null,
    imageAlt: sku.product.images[0]?.altText ?? null,
    alreadyTheirs: sku.supplies.length > 0,
  }));
}

export type AddItemInput = {
  /** What they charge us, as typed. Blank means "not recorded". */
  costAED?: string | null;
  /** Their code for it, off their price list. */
  supplierPartNumber?: string | null;
};

export async function addItemToSupplier(
  supplierId: string,
  skuId: string,
  input: AddItemInput = {}
): Promise<Result> {
  const actor = await requireAdmin("suppliers");

  const [supplier, sku] = await Promise.all([
    db.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, companyName: true },
    }),
    db.productSku.findUnique({
      where: { id: skuId },
      select: { id: true, skuCode: true },
    }),
  ]);
  if (!supplier) return fail("That supplier no longer exists.");
  if (!sku) return fail("That pack no longer exists.");

  const already = await db.productSupply.findFirst({
    where: { supplierId, skuId },
    select: { id: true },
  });
  // Not an error worth stopping on: two people working the same price list
  // will land on this, and the end state they wanted is already true.
  if (already) return fail("That pack is already on their list.");

  // The same parser the supplier's own form uses, rather than a second one
  // beside it: it already knows that "12,34" is a decimal comma in half the
  // world and must be refused rather than guessed at.
  const cost = parseCostToFils(input.costAED);
  if (!cost.ok) return fail(cost.error);

  await db.productSupply.create({
    data: {
      sku: { connect: { id: skuId } },
      supplier: { connect: { id: supplierId } },
      // An offer. Cover is the Cover screen's decision — see the note above.
      rank: null,
      isApproved: true,
      costFils: cost.fils,
      supplierPartNumber: trim(input.supplierPartNumber),
      supplyStatus: "Available",
      isAvailable: true,
    },
  });

  await audit(actor, "supply.adminAdd", "Supplier", supplier.companyName, null, {
    skuCode: sku.skuCode,
    costFils: cost.fils,
  });

  return { ok: true, value: undefined };
}

/**
 * Take a pack off a supplier's list.
 *
 * COVER IS REFUSED HERE, exactly as it is refused in the supplier's own
 * portal, and for the same reason: dropping a row we depend on takes a line
 * out of the buying run. The difference is that an admin CAN do it — on the
 * Cover screen, where the consequence is visible because the empty slot is
 * sitting there in front of them. This is a list of forty rows with a Remove
 * on each; that is not the screen to lose a primary supplier from by mis-click.
 */
export async function removeItemFromSupplier(supplyId: string): Promise<Result> {
  const actor = await requireAdmin("suppliers");

  const supply = await db.productSupply.findUnique({
    where: { id: supplyId },
    select: {
      id: true,
      rank: true,
      sku: { select: { skuCode: true } },
      supplier: { select: { companyName: true } },
    },
  });
  if (!supply) return fail("That is already off their list.");

  if (supply.rank !== null) {
    return fail(
      `We have this allocated to them as ${supply.rank === "Primary" ? "the primary" : "a backup"} supplier. Clear it on Cover first.`
    );
  }

  await db.productSupply.delete({ where: { id: supplyId } });

  await audit(
    actor,
    "supply.adminRemove",
    "Supplier",
    supply.supplier.companyName,
    { skuCode: supply.sku.skuCode },
    null
  );

  return { ok: true, value: undefined };
}

const trim = (value: string | null | undefined): string | null => {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : null;
};
