import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";
import { invalidateCatalog } from "./catalog";

/**
 * The options a product varies by — Size, Colour — and their values.
 *
 * The data has carried these since the variant work, and the storefront reads
 * them to build the picker, but nothing in the admin could touch them: an
 * option existed because a seed script created it, and a new colour meant a
 * developer. This is the screen for it.
 *
 * THREE THINGS, AND THEY ARE NOT THE SAME THING:
 *
 *  - an OPTION is the question ("Colour")
 *  - a VALUE is one answer to it ("Blue")
 *  - a SKU holds one value per option, and that is what makes it *the blue
 *    large one* rather than just another item code
 *
 * REMOVING IS GUARDED BY USE, not by permission. A value some pack is defined
 * by cannot simply be deleted: those packs would stop being anything in
 * particular, the picker would offer a combination that resolves to nothing,
 * and nobody would find out until a customer chose it. The refusal names how
 * many packs are in the way, because "detach these four first" is an
 * instruction and "in use" is not.
 */

const fail = (error: string): Result<never> => ({ ok: false, error });

export type OptionView = {
  id: string;
  name: string;
  values: { id: string; value: string; skuCount: number }[];
};

export async function productOptions(
  productMasterId: string
): Promise<OptionView[]> {
  await requireAdmin("products", "view");

  const options = await db.productOption.findMany({
    where: { productMasterId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      values: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          value: true,
          // How many packs are defined by it, which is what decides whether
          // it can be removed — counted here so the button can say so before
          // it is pressed rather than refusing afterwards.
          _count: { select: { skus: true } },
        },
      },
    },
  });

  return options.map((option) => ({
    id: option.id,
    name: option.name,
    values: option.values.map((v) => ({
      id: v.id,
      value: v.value,
      skuCount: v._count.skus,
    })),
  }));
}

/** What each pack of this product currently is, per option. */
export async function skuOptionValues(
  productMasterId: string
): Promise<Map<string, Set<string>>> {
  await requireAdmin("products", "view");

  const rows = await db.skuOptionValue.findMany({
    where: { sku: { productMasterId } },
    select: { skuId: true, valueId: true },
  });

  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = map.get(row.skuId) ?? new Set<string>();
    set.add(row.valueId);
    map.set(row.skuId, set);
  }
  return map;
}

export async function addOption(
  productMasterId: string,
  name: string
): Promise<Result> {
  const actor = await requireAdmin("products");

  const clean = name.trim();
  if (!clean) return fail("An option needs a name.");

  const product = await db.productMaster.findUnique({
    where: { id: productMasterId },
    select: { name: true },
  });
  if (!product) return fail("That product no longer exists.");

  const clash = await db.productOption.findFirst({
    where: { productMasterId, name: clean },
    select: { id: true },
  });
  if (clash) return fail(`This product already varies by ${clean}.`);

  // Appended rather than inserted: the order options appear in is the order
  // the picker asks the questions, and a new one belongs after the ones
  // people already answer.
  const last = await db.productOption.findFirst({
    where: { productMasterId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await db.productOption.create({
    data: { productMasterId, name: clean, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });

  await audit(actor, "productOption.add", "ProductMaster", product.name, null, clean);
  await invalidateCatalog();
  return { ok: true, value: undefined };
}

export async function removeOption(optionId: string): Promise<Result> {
  const actor = await requireAdmin("products");

  const option = await db.productOption.findUnique({
    where: { id: optionId },
    select: {
      id: true,
      name: true,
      product: { select: { name: true } },
      values: { select: { _count: { select: { skus: true } } } },
    },
  });
  if (!option) return fail("That option is already gone.");

  const inUse = option.values.reduce((n, v) => n + v._count.skus, 0);
  if (inUse > 0) {
    return fail(
      `${inUse} pack${inUse === 1 ? " is" : "s are"} defined by a ${option.name}. Clear it from those packs first, or this product stops saying which one they are.`
    );
  }

  // Its values go with it. They are answers to a question nobody is asking
  // any more, and none of them is attached to a pack.
  await db.productOption.delete({ where: { id: optionId } });

  await audit(
    actor,
    "productOption.remove",
    "ProductMaster",
    option.product.name,
    option.name,
    null
  );
  await invalidateCatalog();
  return { ok: true, value: undefined };
}

export async function addValue(
  optionId: string,
  value: string
): Promise<Result<string>> {
  const actor = await requireAdmin("products");

  const clean = value.trim();
  if (!clean) return fail("A value needs something in it.");

  const option = await db.productOption.findUnique({
    where: { id: optionId },
    select: { id: true, name: true, product: { select: { name: true } } },
  });
  if (!option) return fail("That option no longer exists.");

  const clash = await db.productOptionValue.findFirst({
    where: { optionId, value: clean },
    select: { id: true },
  });
  if (clash) return fail(`${option.name} already has ${clean}.`);

  const last = await db.productOptionValue.findFirst({
    where: { optionId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await db.productOptionValue.create({
    data: { optionId, value: clean, sortOrder: (last?.sortOrder ?? -1) + 1 },
    select: { id: true },
  });

  await audit(
    actor,
    "productOptionValue.add",
    "ProductMaster",
    option.product.name,
    null,
    `${option.name}: ${clean}`
  );
  await invalidateCatalog();
  // The id, so the caller can put a pack form in front of somebody for it.
  return { ok: true, value: created.id };
}

export async function removeValue(valueId: string): Promise<Result> {
  const actor = await requireAdmin("products");

  const value = await db.productOptionValue.findUnique({
    where: { id: valueId },
    select: {
      id: true,
      value: true,
      option: { select: { name: true, product: { select: { name: true } } } },
      _count: { select: { skus: true } },
    },
  });
  if (!value) return fail("That value is already gone.");

  if (value._count.skus > 0) {
    const n = value._count.skus;
    return fail(
      `${n} pack${n === 1 ? " is" : "s are"} ${value.value}. Change ${n === 1 ? "it" : "them"} to something else first — removing this would leave ${n === 1 ? "a pack" : "packs"} that no longer ${n === 1 ? "says" : "say"} which one ${n === 1 ? "it is" : "they are"}.`
    );
  }

  await db.productOptionValue.delete({ where: { id: valueId } });

  await audit(
    actor,
    "productOptionValue.remove",
    "ProductMaster",
    value.option.product.name,
    `${value.option.name}: ${value.value}`,
    null
  );
  await invalidateCatalog();
  return { ok: true, value: undefined };
}

/**
 * What one pack is, across every option on its product.
 *
 * Takes the WHOLE set rather than one value at a time, because "the large blue
 * one" is a single fact and setting it in two steps leaves a moment where the
 * pack is a large green one that never existed. Passing no value for an option
 * clears it — a pack is allowed not to answer every question, which is what a
 * one-size product looks like beside a product that varies by size.
 */
export async function setSkuOptionValues(
  skuId: string,
  valueIds: string[]
): Promise<Result> {
  const actor = await requireAdmin("products");

  const sku = await db.productSku.findUnique({
    where: { id: skuId },
    select: { id: true, skuCode: true, productMasterId: true },
  });
  if (!sku) return fail("That pack no longer exists.");

  const chosen = valueIds.filter(Boolean);

  // Every value has to belong to an option on THIS product. Anything else is
  // a stale form or a hand-made request, and either way it would make the
  // pack a colour of somebody else's product.
  if (chosen.length > 0) {
    const valid = await db.productOptionValue.count({
      where: {
        id: { in: chosen },
        option: { productMasterId: sku.productMasterId },
      },
    });
    if (valid !== chosen.length) return fail("That is not a value on this product.");
  }

  await db.$transaction(async (tx) => {
    await tx.skuOptionValue.deleteMany({ where: { skuId } });
    if (chosen.length > 0) {
      await tx.skuOptionValue.createMany({
        data: chosen.map((valueId) => ({ skuId, valueId })),
      });
    }
  });

  await db.productMaster.update({ where: { id: sku.productMasterId }, data: { updatedAt: new Date() } });
  await audit(actor, "sku.options", "ProductSku", sku.skuCode, null, {
    values: chosen.length,
  });
  await invalidateCatalog();
  return { ok: true, value: undefined };
}
