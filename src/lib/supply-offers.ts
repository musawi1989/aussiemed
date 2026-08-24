import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";
import { requireSupplier } from "./supplier-portal";

/**
 * A supplier adding items to their own list, and the switch that governs it.
 *
 * Until now AussieMed decided what every supplier covered, and the portal said
 * so: "get in touch and we will add them". That is a phone call for something
 * the supplier knows better than we do.
 *
 * AN OFFER IS NOT COVER. Adding an item creates a supply row with a NULL rank,
 * which means "I can supply this" and nothing more. It receives no purchase
 * order — the buying run only reads Primary and Backup, and excludes nulls in
 * its query. Who actually gets ordered from stays AussieMed's decision, made
 * on the Cover screen. A supplier cannot promote themselves.
 *
 * APPROVALS ARE OFF BY DEFAULT, at the client's request: additions land
 * immediately. Turning the switch on makes each one arrive unapproved instead,
 * for somebody here to accept. Off is the honest default for a switch whose
 * purpose is to slow things down only when that is wanted.
 */

const APPROVAL_KEY = "supplyOffersNeedApproval";

const fail = (error: string): Result<never> => ({ ok: false, error });

export async function offersNeedApproval(): Promise<boolean> {
  const row = await db.setting.findUnique({ where: { key: APPROVAL_KEY } });
  return row?.value === "true";
}

export async function setOffersNeedApproval(on: boolean): Promise<Result> {
  const actor = await requireAdmin();
  const before = await offersNeedApproval();

  await db.setting.upsert({
    where: { key: APPROVAL_KEY },
    update: { value: String(on) },
    create: { key: APPROVAL_KEY, value: String(on) },
  });

  await audit(actor, "setting.supplyApproval", "Setting", APPROVAL_KEY, before, on);
  return { ok: true, value: undefined };
}

export type BrowsableProduct = {
  skuId: string;
  skuCode: string;
  name: string;
  /** The storefront page for the item, so a supplier can see what it is. */
  slug: string;
  unitLabel: string;
  categoryName: string | null;
  categoryId: string | null;
  image: string | null;
  imageAlt: string | null;
  /** Already on their list, so it shows as such rather than offering Add. */
  mine: boolean;
};

/**
 * The catalogue, marking what this supplier already has.
 *
 * ALREADY-SUPPLIED ITEMS STAY IN THE LIST, shown as theirs rather than being
 * filtered out. They were filtered out first, on the reasoning that a list of
 * things you cannot pick is one you read twice — and that turned out to be
 * wrong for a reason only visible when running it: Next re-renders the page
 * after a server action, so the row somebody just added disappeared in the
 * same instant, taking its confirmation with it. On a narrow search the whole
 * table emptied and read as a failure.
 *
 * Keeping the row and marking it IS the feedback. It also answers the question
 * a supplier actually has while browsing — "have I already told them about
 * this one?" — which an absent row cannot.
 */
export async function availableProducts(filters: {
  q?: string;
  categoryId?: string;
}): Promise<BrowsableProduct[]> {
  const { supplierId } = await requireSupplier();
  const term = filters.q?.trim();

  const skus = await db.productSku.findMany({
    where: {
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
      ...(term ? {} : {}),
    },
    orderBy: [{ product: { name: "asc" } }, { skuCode: "asc" }],
    take: 100,
    select: {
      id: true,
      skuCode: true,
      unitLabel: true,
      // Just this supplier's row, if there is one. Never anybody else's:
      // who else supplies an item is not theirs to know.
      supplies: { where: { supplierId }, select: { id: true }, take: 1 },
      product: {
        select: {
          name: true,
          slug: true,
          categories: {
            select: { category: { select: { id: true, name: true } } },
          },
          // One picture, so somebody scanning a hundred rows can tell at a
          // glance which item a code refers to. Their part numbers rarely
          // match ours, and adding the wrong line is a wasted delivery.
          images: {
            orderBy: { sortOrder: "asc" },
            take: 1,
            select: { path: true, altText: true },
          },
        },
      },
    },
  });

  return skus.map((sku) => {
    // The deepest category is the specific one — "Gloves", not "Medical
    // Consumables" — the same rule the saved-products list follows.
    const category = sku.product.categories.at(-1)?.category ?? null;
    return {
      skuId: sku.id,
      skuCode: sku.skuCode,
      name: sku.product.name,
      slug: sku.product.slug,
      unitLabel: sku.unitLabel,
      categoryName: category?.name ?? null,
      categoryId: category?.id ?? null,
      image: sku.product.images[0]?.path ?? null,
      imageAlt: sku.product.images[0]?.altText ?? null,
      mine: sku.supplies.length > 0,
    };
  });
}

/**
 * Add one item to this supplier's list.
 *
 * Rank stays null. See the note at the top: an offer is not cover, and nothing
 * a supplier does here puts them in line for a purchase order.
 */
export async function addToMySupply(skuId: string): Promise<Result<string>> {
  const { supplierId } = await requireSupplier();

  const sku = await db.productSku.findUnique({
    where: { id: skuId },
    select: { id: true, product: { select: { name: true } } },
  });
  if (!sku) return fail("That item no longer exists.");

  const already = await db.productSupply.findFirst({
    where: { skuId, supplierId },
    select: { id: true },
  });
  if (already) return fail("That is already on your list.");

  const needsApproval = await offersNeedApproval();

  const created = await db.productSupply.create({
    data: {
      sku: { connect: { id: skuId } },
      supplier: { connect: { id: supplierId } },
      rank: null,
      isApproved: !needsApproval,
      supplyStatus: "Available",
      isAvailable: true,
    },
    select: { id: true },
  });

  return { ok: true, value: created.id };
}

/**
 * Take an item off their own list.
 *
 * ONLY AN OFFER. A row where they are our primary or backup is cover we agreed
 * and depend on, and letting a supplier drop it from their side would take a
 * line out of the buying run with nothing said to anybody here. Those come off
 * on the Cover screen, by us.
 */
export async function removeFromMySupply(supplyId: string): Promise<Result> {
  const { supplierId } = await requireSupplier();

  const supply = await db.productSupply.findFirst({
    where: { id: supplyId, supplierId },
    select: { id: true, rank: true },
  });
  if (!supply) return fail("That is not on your list.");

  if (supply.rank !== null) {
    return fail(
      "We have this item allocated to you, so it cannot be removed here. Contact us and we will sort it out."
    );
  }

  await db.productSupply.delete({ where: { id: supply.id } });
  return { ok: true, value: undefined };
}

export type UnallocatedProduct = {
  skuId: string;
  skuCode: string;
  name: string;
  unitLabel: string;
  categoryName: string | null;
  /** Suppliers who have offered it without being given cover. */
  offers: { supplierId: string; supplierName: string }[];
};

/**
 * Items nobody is allocated to supply.
 *
 * NOT the same question as the Cover screen's "no primary" filter. That one
 * finds items where the primary slot is empty but somebody may still hold the
 * backup. This finds items with no cover at all — the ones that would fall
 * straight through the buying run with nowhere to go.
 *
 * Offers are shown beside each, because the answer to "who should supply this"
 * is often already on the screen: a supplier has said they can.
 */
export async function unallocatedProducts(filters: {
  q?: string;
  categoryId?: string;
}): Promise<UnallocatedProduct[]> {
  await requireAdmin();
  const term = filters.q?.trim();

  const skus = await db.productSku.findMany({
    where: {
      // No row at either rank. A null-rank offer does not count as cover.
      supplies: { none: { rank: { not: null } } },
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
    take: 200,
    select: {
      id: true,
      skuCode: true,
      unitLabel: true,
      product: {
        select: {
          name: true,
          categories: { select: { category: { select: { name: true } } } },
        },
      },
      supplies: {
        where: { rank: null },
        select: {
          supplierId: true,
          supplier: { select: { companyName: true } },
        },
      },
    },
  });

  return skus.map((sku) => ({
    skuId: sku.id,
    skuCode: sku.skuCode,
    name: sku.product.name,
    unitLabel: sku.unitLabel,
    categoryName: sku.product.categories.at(-1)?.category.name ?? null,
    offers: sku.supplies.map((s) => ({
      supplierId: s.supplierId,
      supplierName: s.supplier.companyName,
    })),
  }));
}
