import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result, type SkuEdit } from "./admin";
import { invalidateCatalog } from "./catalog";

/**
 * Adding and removing the packs a product is sold in.
 *
 * The pack editor could change a pack and could not create one, and the
 * new-product form told people they could "add more pack sizes once it
 * exists" — which was not true of any screen. This is the missing half.
 *
 * REMOVING IS TWO DIFFERENT ACTS AND ONLY ONE OF THEM IS DELETION.
 *
 *  - A pack somebody has BOUGHT is retired, never deleted. The order lines
 *    point at it, and an order that cannot say what was in it is not a record
 *    of anything. That is the Active tick, which already existed.
 *
 *  - A pack nobody has touched — the wrong carton size, typed and saved five
 *    minutes ago — can go properly. Retiring those means the list grows a
 *    permanent tail of mistakes nobody can clear, and everybody stops reading
 *    it.
 *
 * This decides which of the two applies by asking the database what points at
 * the row, rather than by asking the person pressing the button.
 */

const fail = (error: string): Result<never> => ({ ok: false, error });

const toFils = (aed: number) => Math.round(aed * 100);

/** What a delete would break, in the words somebody needs to hear. */
type Blocker = { count: number; noun: string };

async function blockersFor(skuId: string): Promise<Blocker[]> {
  const [orders, poLines, agreed, batches, quotes] = await Promise.all([
    db.orderItem.count({ where: { skuId } }),
    db.purchaseOrderLine.count({ where: { skuId } }),
    db.customerPrice.count({ where: { skuId } }),
    db.skuBatch.count({ where: { skuId } }),
    db.quoteItem.count({ where: { skuId } }),
  ]);

  /*
   * Only the things that would LOSE something.
   *
   * Price breaks, supplier rows, saved lists, cart lines and restock requests
   * are all about this pack and mean nothing without it — they cascade or are
   * cleared, and none of them is a record of something that happened. An order
   * line is. So is a purchase order line, an agreed customer price, and a
   * batch we booked in.
   */
  return [
    { count: orders, noun: orders === 1 ? "customer order" : "customer orders" },
    { count: poLines, noun: poLines === 1 ? "purchase order" : "purchase orders" },
    { count: agreed, noun: agreed === 1 ? "agreed customer price" : "agreed customer prices" },
    { count: batches, noun: batches === 1 ? "stock batch" : "stock batches" },
    { count: quotes, noun: quotes === 1 ? "quote request" : "quote requests" },
  ].filter((b) => b.count > 0);
}

export type PackRemoval =
  | { kind: "deletable" }
  | { kind: "retire-only"; because: string };

/** Whether this pack can go, and what to say if it cannot. */
export async function canRemovePack(skuId: string): Promise<PackRemoval> {
  const blockers = await blockersFor(skuId);
  if (blockers.length === 0) return { kind: "deletable" };

  return {
    kind: "retire-only",
    because: blockers.map((b) => `${b.count} ${b.noun}`).join(", "),
  };
}

export async function addPack(
  productMasterId: string,
  input: SkuEdit
): Promise<Result<string>> {
  const actor = await requireAdmin("products");

  const product = await db.productMaster.findUnique({
    where: { id: productMasterId },
    select: { id: true, name: true },
  });
  if (!product) return fail("That product no longer exists.");

  const checked = check(input);
  if (!checked.ok) return checked;

  const clash = await db.productSku.findFirst({
    where: { skuCode: checked.value.skuCode },
    select: { id: true },
  });
  if (clash) {
    return fail(`Item code ${checked.value.skuCode} is already used by another pack.`);
  }

  const created = await db.productSku.create({
    data: { productMasterId, ...checked.value },
    select: { id: true, skuCode: true },
  });

  await db.productMaster.update({ where: { id: productMasterId }, data: { updatedAt: new Date() } });
  await audit(actor, "sku.create", "ProductSku", created.id, null, {
    product: product.name,
    ...checked.value,
  });
  await invalidateCatalog();

  return { ok: true, value: created.id };
}

export async function removePack(skuId: string): Promise<Result> {
  const actor = await requireAdmin("products");

  const sku = await db.productSku.findUnique({
    where: { id: skuId },
    select: {
      id: true,
      skuCode: true,
      isActive: true,
      productMasterId: true,
      product: { select: { name: true } },
    },
  });
  if (!sku) return fail("That pack is already gone.");

  /*
   * A product with no packs cannot be bought and is a listing that 404s on
   * the way to the cart. Retiring the last one is a decision about the whole
   * product — take the PRODUCT off sale — and this is not the button for it.
   */
  const siblings = await db.productSku.count({
    where: { productMasterId: sku.productMasterId, NOT: { id: skuId } },
  });
  if (siblings === 0) {
    return fail(
      "This is the only pack on the product, and a product with no pack cannot be bought. Take the whole product off sale instead."
    );
  }

  const removal = await canRemovePack(skuId);
  if (removal.kind === "retire-only") {
    return fail(
      `This pack is on ${removal.because}, so deleting it would break records that refer to it. Untick Active to retire it instead — it comes off the storefront and the history stays.`
    );
  }

  // Price breaks, supplier rows, saved lists and the rest go with it: they
  // describe this pack and mean nothing once it is gone. The schema cascades
  // them; nothing here is a record of something that happened.
  await db.productSku.delete({ where: { id: skuId } });
  await db.productMaster.update({ where: { id: sku.productMasterId }, data: { updatedAt: new Date() } });

  await audit(actor, "sku.delete", "ProductSku", sku.id, {
    skuCode: sku.skuCode,
    product: sku.product.name,
  }, null);
  await invalidateCatalog();

  return { ok: true, value: undefined };
}

/**
 * The same rules updateSku applies, so a pack cannot be created in a state the
 * editor beside it would refuse to save.
 */
function check(input: SkuEdit): Result<{
  skuCode: string;
  baseUnitName: string;
  unitLabel: string;
  unitShortLabel: string;
  eachesPerPack: number;
  priceFils: number;
  manualOutOfStock: boolean;
  isActive: boolean;
}> {
  const skuCode = input.skuCode.trim();
  if (!skuCode) return fail("A pack needs an item code.");
  if (!input.unitLabel.trim()) return fail("A pack needs a unit label.");
  if (!Number.isFinite(input.priceAED) || input.priceAED <= 0) {
    return fail("The price must be more than zero.");
  }
  if (!Number.isInteger(input.eachesPerPack) || input.eachesPerPack < 1) {
    return fail("Units per pack must be a whole number of at least 1.");
  }

  return {
    ok: true,
    value: {
      skuCode,
      baseUnitName: input.baseUnitName.trim() || "Each",
      unitLabel: input.unitLabel.trim(),
      unitShortLabel: input.unitShortLabel.trim() || input.unitLabel.trim(),
      eachesPerPack: input.eachesPerPack,
      priceFils: toFils(input.priceAED),
      manualOutOfStock: input.manualOutOfStock,
      isActive: input.isActive,
    },
  };
}
