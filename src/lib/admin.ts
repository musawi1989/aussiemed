import "server-only";

import { invalidateCatalog } from "./catalog";
import {
  ORDER_LINE_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} from "./order-views";
import { db } from "./db";
import { getSessionUser, type SessionUser } from "./auth";
import { putProductImage, removeStoredImage } from "./storage";
import { restockAlert } from "./email-message";
import { sendQuietly } from "./mailer";
import { publicUrl } from "./public-url";
import { recordStatus } from "./status-events";

/**
 * Every write the admin screens make goes through this file.
 *
 * Three things are true of all of them, and putting them in one place is the
 * only way to keep that true:
 *
 *  1. The caller is an admin. Checked here, in the service layer, not only by
 *     hiding a button — a server action is a public HTTP endpoint.
 *  2. The change is recorded in AuditLog with who, what and the before state.
 *     A catalogue nobody can account for is worse than one nobody can edit.
 *  3. Anything the storefront reads bumps the catalogue version, so the change
 *     is visible immediately rather than after a restart. See BE-25.
 *
 * Actions return a Result rather than throwing, so a form can show the reason
 * next to the field instead of a page-level error.
 */

export { ORDER_STATUSES, ORDER_LINE_STATUSES, PAYMENT_STATUSES };

export type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

/* ------------------------------------------------------------------ *
 * Guard
 * ------------------------------------------------------------------ */

/**
 * Throws rather than returning a Result: a non-admin reaching one of these is
 * not a validation problem the user can correct, and the caller should not be
 * able to carry on by ignoring a return value.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || user.role !== "Admin") {
    throw new Error("Admin access required");
  }
  return user;
}

/* ------------------------------------------------------------------ *
 * Audit
 * ------------------------------------------------------------------ */

/**
 * `before` is stored as JSON text because the database is SQLite today and
 * Postgres later; a String column ports cleanly either way. Only the fields
 * that changed are recorded, so the log stays readable.
 */
export async function audit(
  actor: SessionUser,
  action: string,
  entity: string,
  entityId: string,
  before?: unknown,
  after?: unknown
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorUserId: actor.id,
      action,
      entity,
      entityId,
      before: before === undefined ? null : JSON.stringify(before),
      after: after === undefined ? null : JSON.stringify(after),
    },
  });
}

/** Narrows an object to the keys that actually differ, for a readable log. */
function changed<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (before[key] !== after[key]) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a };
}

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

/** AED to integer fils. Money never exists as a float in the database. */
export function toFils(aed: number): number {
  return Math.round(aed * 100);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const trim = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
};

/** A plain email shape check. Deliverability is a different problem (IN-03). */
const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

export const PRODUCT_STATUSES = [
  "Draft",
  "PendingApproval",
  "Active",
  "Inactive",
] as const;
export const TAX_CLASSES = ["Standard", "ZeroRated"] as const;

export type ProductEdit = {
  name: string;
  description: string | null;
  brandId: string | null;
  /**
   * No supplierId. A product is not owned by a supplier — supply is per pack
   * with a primary and a backup, held in ProductSupply (DEC-25).
   *
   * It was still here long after the column went, and it broke every save:
   * the form had correctly stopped sending one, so updateProduct looked up a
   * supplier with a blank id, found nothing, and refused with "That supplier
   * no longer exists." Nothing in the type system caught it because the field
   * existed on this type and was simply never satisfied.
   */
  taxClass: string;
  variantGroup: string | null;
  variantLabel: string | null;
  categoryIds: string[];
};

/**
 * A new product, and the first pack it is sold in.
 *
 * The pack is not optional and is not a second step. A ProductMaster on its
 * own has no code, no unit and no price — there is nothing to put in a cart,
 * so it is not a product yet, it is a name. Creating one without a pack would
 * leave a row that passes every screen and fails db:check's "no product exists
 * without a purchasable SKU", and the person who made it would have no reason
 * to think anything was wrong.
 *
 * It arrives as Draft. Going live is `setProductStatus`, deliberately its own
 * action — the moment a product becomes buyable is worth being a decision
 * rather than the last field on a long form.
 */
export type ProductCreate = ProductEdit & {
  skuCode: string;
  unitLabel: string;
  unitShortLabel: string;
  baseUnitName: string;
  eachesPerPack: number;
  priceAED: number;
};

export async function createProduct(
  input: ProductCreate
): Promise<Result<{ id: string; slug: string }>> {
  const actor = await requireAdmin();

  const name = input.name.trim();
  if (!name) return fail("A product needs a name.");
  if (!TAX_CLASSES.includes(input.taxClass as (typeof TAX_CLASSES)[number])) {
    return fail("That is not a tax class we recognise.");
  }
  if (input.categoryIds.length === 0) {
    return fail("Choose at least one category, or nobody can browse to it.");
  }

  const skuCode = input.skuCode.trim();
  if (!skuCode) return fail("The first pack needs an item code.");
  if (!input.unitLabel.trim()) {
    return fail("The first pack needs a unit label, e.g. 100 Pieces/Box.");
  }
  if (!Number.isFinite(input.priceAED) || input.priceAED <= 0) {
    return fail("The price must be more than zero.");
  }
  if (!Number.isInteger(input.eachesPerPack) || input.eachesPerPack < 1) {
    return fail("Units per pack must be a whole number of at least 1.");
  }

  // Item codes are unique across the whole catalogue, and this is the error a
  // person will actually hit — typing a code that is already on another
  // product. Checked before anything is written so the failure costs nothing.
  const clash = await db.productSku.findUnique({ where: { skuCode } });
  if (clash) return fail(`Item code ${skuCode} is already used by another SKU.`);

  const categories = await db.category.findMany({
    where: { id: { in: input.categoryIds } },
    select: { id: true },
  });
  if (categories.length !== input.categoryIds.length) {
    return fail("One of those categories no longer exists. Reload and try again.");
  }

  if (input.brandId) {
    const brand = await db.brand.findUnique({ where: { id: input.brandId } });
    if (!brand) return fail("That brand no longer exists.");
  }

  // Slugs are unique across the catalogue and are the product's URL. A second
  // "Nitrile Gloves" gets -2 rather than being refused: two products may
  // legitimately share a name, and the person naming them should not have to
  // invent a difference to satisfy a database.
  const base = slugify(name);
  let slug = base;
  for (let n = 2; await db.productMaster.findUnique({ where: { slug } }); n += 1) {
    slug = `${base}-${n}`;
  }

  const product = await db.$transaction(async (tx) => {
    const created = await tx.productMaster.create({
      data: {
        name,
        slug,
        description: trim(input.description),
        brandId: input.brandId || null,
        taxClass: input.taxClass,
        variantGroup: trim(input.variantGroup),
        variantLabel: trim(input.variantLabel),
        status: "Draft",
        createdBy: actor.id,
      },
    });

    await tx.productCategory.createMany({
      data: input.categoryIds.map((categoryId) => ({
        productMasterId: created.id,
        categoryId,
      })),
    });

    await tx.productSku.create({
      data: {
        productMasterId: created.id,
        skuCode,
        baseUnitName: input.baseUnitName.trim() || "Each",
        unitLabel: input.unitLabel.trim(),
        unitShortLabel: input.unitShortLabel.trim() || input.unitLabel.trim(),
        eachesPerPack: input.eachesPerPack,
        priceFils: toFils(input.priceAED),
      },
    });

    return created;
  });

  await audit(actor, "product.create", "ProductMaster", product.id, undefined, {
    name,
    slug,
    status: "Draft",
    taxClass: input.taxClass,
    categoryIds: input.categoryIds,
    skuCode,
    priceFils: toFils(input.priceAED),
  });
  await invalidateCatalog();
  return ok({ id: product.id, slug });
}

export async function updateProduct(
  id: string,
  input: ProductEdit
): Promise<Result> {
  const actor = await requireAdmin();

  const existing = await db.productMaster.findUnique({
    where: { id },
    include: { categories: true },
  });
  if (!existing) return fail("That product no longer exists.");

  const name = input.name.trim();
  if (!name) return fail("A product needs a name.");
  if (!TAX_CLASSES.includes(input.taxClass as (typeof TAX_CLASSES)[number])) {
    return fail("That is not a tax class we recognise.");
  }

  // A product with no category is unreachable by browsing: it exists, it is
  // searchable, and no amount of clicking will ever find it.
  if (input.categoryIds.length === 0) {
    return fail("Choose at least one category, or nobody can browse to it.");
  }

  const data = {
    name,
    description: trim(input.description),
    brandId: input.brandId || null,
    taxClass: input.taxClass,
    variantGroup: trim(input.variantGroup),
    variantLabel: trim(input.variantLabel),
  };

  const diff = changed(existing as unknown as Record<string, unknown>, data);

  await db.$transaction(async (tx) => {
    await tx.productMaster.update({ where: { id }, data });
    await tx.productCategory.deleteMany({ where: { productMasterId: id } });
    await tx.productCategory.createMany({
      data: input.categoryIds.map((categoryId) => ({
        productMasterId: id,
        categoryId,
      })),
    });
  });

  await audit(actor, "product.update", "ProductMaster", id, diff.before, {
    ...diff.after,
    categoryIds: input.categoryIds,
  });
  await invalidateCatalog();
  return ok(undefined);
}

/**
 * Approval is deliberately its own action rather than a field on the edit
 * form. Moving a product to Active is the moment it becomes buyable, and a
 * supplier may never do it — the rule is enforced here, where it cannot be
 * bypassed by posting to the endpoint directly.
 */
export async function setProductStatus(
  id: string,
  status: string
): Promise<Result> {
  const actor = await requireAdmin();

  if (!PRODUCT_STATUSES.includes(status as (typeof PRODUCT_STATUSES)[number])) {
    return fail("That is not a status we recognise.");
  }

  const existing = await db.productMaster.findUnique({
    where: { id },
    include: { skus: { where: { isActive: true } }, categories: true },
  });
  if (!existing) return fail("That product no longer exists.");
  if (existing.status === status) return ok(undefined);

  // Guard the two things that make a live product broken rather than merely
  // incomplete: nothing to buy, and nowhere to find it.
  if (status === "Active") {
    if (existing.skus.length === 0) {
      return fail("This product has no active SKU, so there is nothing to buy.");
    }
    if (existing.categories.length === 0) {
      return fail("Give it a category first, or nobody can browse to it.");
    }
  }

  await db.productMaster.update({
    where: { id },
    data: {
      status,
      // Record the approval only on the transition that grants it.
      ...(status === "Active" && existing.status !== "Active"
        ? { approvedBy: actor.id, approvedAt: new Date() }
        : {}),
    },
  });

  await audit(
    actor,
    "product.status",
    "ProductMaster",
    id,
    { status: existing.status },
    { status }
  );
  await invalidateCatalog();
  return ok(undefined);
}

/* ------------------------------------------------------------------ *
 * Product images
 * ------------------------------------------------------------------ */

/**
 * Adding, ordering and removing product photography — BE-29.
 *
 * Until now the only way to give a product an image was to put a file on disk
 * and re-seed, which meant DA-03 and DA-24 could only ever be closed by us and
 * never by the client. The bytes go to src/lib/storage.ts; this file records
 * the row, keeps the ordering coherent and audits the change.
 *
 * The first image, by sortOrder, is the one the storefront shows.
 */
export async function addProductImage(
  productId: string,
  bytes: Buffer,
  altText: string | null
): Promise<Result<{ url: string }>> {
  const actor = await requireAdmin();

  const product = await db.productMaster.findUnique({
    where: { id: productId },
    select: { id: true, slug: true, name: true },
  });
  if (!product) return fail("That product no longer exists.");

  const stored = await putProductImage(bytes, product.slug);
  if (!stored.ok) return fail(stored.error);

  // Appended, never inserted at the front: uploading a second photograph
  // should not silently change which one the catalogue shows.
  const last = await db.productImage.findFirst({
    where: { productMasterId: productId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const image = await db.productImage.create({
    data: {
      productMasterId: productId,
      path: stored.url,
      // Falls back to the product name so the image is never announced to a
      // screen reader as an empty string.
      altText: trim(altText) ?? product.name,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  await audit(actor, "product.image.add", "ProductMaster", productId, null, {
    imageId: image.id,
    path: image.path,
  });
  await invalidateCatalog();
  return ok({ url: stored.url });
}

export async function removeProductImage(imageId: string): Promise<Result> {
  const actor = await requireAdmin();

  const image = await db.productImage.findUnique({ where: { id: imageId } });
  if (!image) return fail("That image has already been removed.");

  await db.productImage.delete({ where: { id: imageId } });

  // The file is only deleted if we are the ones who stored it. Seed
  // photography is referenced from elsewhere in public/ and is left alone —
  // removing the row is enough, and deleting a shared file would break every
  // other product pointing at it.
  await removeStoredImage(image.path);

  await audit(
    actor,
    "product.image.remove",
    "ProductMaster",
    image.productMasterId,
    { imageId, path: image.path },
    null
  );
  await invalidateCatalog();
  return ok(undefined);
}

/** Promotes one image to the front, which is what the storefront displays. */
export async function setPrimaryProductImage(imageId: string): Promise<Result> {
  const actor = await requireAdmin();

  const image = await db.productImage.findUnique({ where: { id: imageId } });
  if (!image) return fail("That image has already been removed.");

  const siblings = await db.productImage.findMany({
    where: { productMasterId: image.productMasterId },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });

  // Rewritten as a dense 0..n-1 sequence rather than by giving the chosen one
  // a lower number. Repeated promotions would otherwise drift into negatives,
  // and duplicate sortOrders make "the first image" a matter of luck.
  const reordered = [
    imageId,
    ...siblings.map((s) => s.id).filter((id) => id !== imageId),
  ];

  await db.$transaction(
    reordered.map((id, index) =>
      db.productImage.update({ where: { id }, data: { sortOrder: index } })
    )
  );

  await audit(
    actor,
    "product.image.primary",
    "ProductMaster",
    image.productMasterId,
    { primary: siblings[0]?.id ?? null },
    { primary: imageId }
  );
  await invalidateCatalog();
  return ok(undefined);
}

/* ------------------------------------------------------------------ *
 * SKUs and price breaks
 * ------------------------------------------------------------------ */

export type SkuEdit = {
  skuCode: string;
  baseUnitName: string;
  unitLabel: string;
  unitShortLabel: string;
  eachesPerPack: number;
  priceAED: number;
  manualOutOfStock: boolean;
  isActive: boolean;
};

export async function updateSku(id: string, input: SkuEdit): Promise<Result> {
  const actor = await requireAdmin();

  const existing = await db.productSku.findUnique({ where: { id } });
  if (!existing) return fail("That SKU no longer exists.");

  const skuCode = input.skuCode.trim();
  if (!skuCode) return fail("A SKU needs an item code.");
  if (!input.unitLabel.trim()) return fail("A SKU needs a unit label.");
  if (!Number.isFinite(input.priceAED) || input.priceAED <= 0) {
    return fail("The price must be more than zero.");
  }
  if (!Number.isInteger(input.eachesPerPack) || input.eachesPerPack < 1) {
    return fail("Units per pack must be a whole number of at least 1.");
  }

  const clash = await db.productSku.findFirst({
    where: { skuCode, NOT: { id } },
  });
  if (clash) return fail(`Item code ${skuCode} is already used by another SKU.`);

  const data = {
    skuCode,
    baseUnitName: input.baseUnitName.trim() || "Each",
    unitLabel: input.unitLabel.trim(),
    unitShortLabel: input.unitShortLabel.trim() || input.unitLabel.trim(),
    eachesPerPack: input.eachesPerPack,
    priceFils: toFils(input.priceAED),
    manualOutOfStock: input.manualOutOfStock,
    isActive: input.isActive,
  };

  const diff = changed(existing as unknown as Record<string, unknown>, data);
  await db.productSku.update({ where: { id }, data });

  await audit(actor, "sku.update", "ProductSku", id, diff.before, diff.after);
  await invalidateCatalog();

  // Every toggle, not just the current flag — BE-31. Without this, "how long
  // has this been unavailable" and "how quickly does that supplier restock"
  // are unanswerable, and both are conversations the admin has with suppliers.
  // Recorded on the transition only, so re-saving an unchanged SKU does not
  // fill the log with non-events.
  if (existing.manualOutOfStock !== data.manualOutOfStock) {
    await recordStatus({
      entity: "ProductSku",
      entityId: id,
      entityRef: existing.skuCode,
      fromStatus: existing.manualOutOfStock ? "OutOfStock" : "InStock",
      toStatus: data.manualOutOfStock ? "OutOfStock" : "InStock",
      actor: { id: actor.id, name: actor.name, role: "Admin" },
    });
  }

  // Coming back into stock is the one moment a customer is emailed without
  // asking twice — they asked once, on Notify Me, and this is the answer.
  // Only on the transition, so re-saving a SKU that is already in stock does
  // not mail the same people again.
  if (existing.manualOutOfStock && !data.manualOutOfStock) {
    await notifyRestock(id);
  }

  return ok(undefined);
}

/**
 * Tells everyone waiting that a pack is available again — FN-04, BE-05.
 *
 * Each subscription is stamped as it is sent, so nobody is told twice, and the
 * stamp is written whatever the mailer says: a suppressed address is still an
 * answered subscription, and leaving it unstamped would make it queue again on
 * the next stock change forever.
 */
async function notifyRestock(skuId: string): Promise<void> {
  const sku = await db.productSku.findUnique({
    where: { id: skuId },
    select: {
      skuCode: true,
      unitLabel: true,
      priceFils: true,
      product: { select: { name: true, slug: true } },
      notify: { where: { notifiedAt: null }, select: { id: true, email: true } },
    },
  });
  if (!sku || sku.notify.length === 0) return;

  for (const subscription of sku.notify) {
    await sendQuietly(
      restockAlert({
        to: subscription.email,
        productName: sku.product.name,
        skuCode: sku.skuCode,
        unitLabel: sku.unitLabel,
        priceFils: sku.priceFils,
        productUrl: `${publicUrl()}/products/${sku.product.slug}`,
      }),
      {
        entity: "NotifySubscription",
        entityId: subscription.id,
        dedupeKey: `RestockAlert:${subscription.id}`,
      }
    );

    await db.notifySubscription.update({
      where: { id: subscription.id },
      data: { notifiedAt: new Date() },
    });
  }
}

export type TierEdit = {
  minQty: number;
  priceAED: number;
  unitName: string | null;
  unitsPerLevel: number | null;
};

/**
 * Price breaks are replaced wholesale rather than edited one by one, because
 * they only make sense as a set: each must be cheaper than the one below it,
 * and that cannot be checked a row at a time.
 */
export async function replaceTiers(
  skuId: string,
  tiers: TierEdit[]
): Promise<Result> {
  const actor = await requireAdmin();

  const sku = await db.productSku.findUnique({
    where: { id: skuId },
    include: { tiers: true },
  });
  if (!sku) return fail("That SKU no longer exists.");

  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);

  let floorFils = sku.priceFils;
  const seen = new Set<number>();
  for (const tier of sorted) {
    if (!Number.isInteger(tier.minQty) || tier.minQty < 2) {
      return fail("A price break needs a whole quantity of 2 or more.");
    }
    if (seen.has(tier.minQty)) {
      return fail(`There are two breaks at ${tier.minQty}. Each quantity can appear once.`);
    }
    seen.add(tier.minQty);

    const fils = toFils(tier.priceAED);
    if (fils <= 0) return fail("A price break must be more than zero.");
    if (fils >= floorFils) {
      return fail(
        `The break at ${tier.minQty} is not cheaper than the price below it. Breaks must fall as quantity rises.`
      );
    }
    floorFils = fils;

    if (tier.unitsPerLevel !== null && tier.unitsPerLevel < 1) {
      return fail("Units per level must be at least 1 when it is given.");
    }
  }

  await db.$transaction(async (tx) => {
    await tx.priceTier.deleteMany({ where: { skuId } });
    await tx.priceTier.createMany({
      data: sorted.map((tier) => ({
        skuId,
        minQty: tier.minQty,
        priceFils: toFils(tier.priceAED),
        unitName: trim(tier.unitName),
        unitsPerLevel: tier.unitsPerLevel,
      })),
    });
  });

  await audit(
    actor,
    "sku.tiers",
    "ProductSku",
    skuId,
    sku.tiers.map((t) => ({ minQty: t.minQty, priceFils: t.priceFils })),
    sorted.map((t) => ({ minQty: t.minQty, priceFils: toFils(t.priceAED) }))
  );
  await invalidateCatalog();
  return ok(undefined);
}

/* ------------------------------------------------------------------ *
 * Suppliers
 * ------------------------------------------------------------------ */

export type SupplierEdit = {
  companyName: string;
  primaryEmail: string;
  secondaryEmail: string;
  phone: string | null;
  /** ISO 3166-1 alpha-2. Suppliers are the likeliest to be outside the UAE. */
  countryCode: string;
  emirate: string | null;
  address: string | null;
  trn: string | null;
  status: string;
  /**
   * What they have promised — BE-33.
   *
   * "On time" means nothing without a promise to measure against, and these
   * are numbers agreed personally at onboarding rather than anything the
   * system can work out. Both nullable: an unrecorded promise must read as
   * "not agreed" rather than as a target of zero, which every supplier would
   * then miss.
   */
  promisedLeadTimeDays: string | null;
  ackSlaHours: string | null;
};

/**
 * secondaryEmail is mandatory at creation. That is a platform decision, not a
 * form nicety — both addresses receive order notifications, and a supplier
 * with one contact is a supplier whose orders go unread when that person is
 * away. The column stays nullable for rows that predate the rule, so it is
 * enforced here rather than in the schema.
 */
/**
 * A promised number, or nothing.
 *
 * Blank means not agreed, which is not the same as zero — a target of zero
 * days is one every supplier misses, and an on-time rate built on it would be
 * confidently wrong. See BE-33 and lifecycle.onTimeRate, which returns null
 * rather than a rate when there is no promise.
 */
function promisedNumber(
  raw: string | null,
  max: number
): { ok: true; value: number | null } | { ok: false; error: string } {
  const text = (raw ?? "").trim();
  if (!text) return { ok: true, value: null };
  if (!/^\d+$/.test(text)) {
    return { ok: false, error: `"${text}" is not a whole number.` };
  }
  const value = Number(text);
  if (value < 1 || value > max) {
    return { ok: false, error: `That should be between 1 and ${max}.` };
  }
  return { ok: true, value };
}

/** The parsed value, once validateSupplier has already accepted it. */
function promisedValue(raw: string | null, max: number): number | null {
  const parsed = promisedNumber(raw, max);
  return parsed.ok ? parsed.value : null;
}

function validateSupplier(input: SupplierEdit): string | null {
  if (!input.companyName.trim()) return "A supplier needs a company name.";
  if (!looksLikeEmail(input.primaryEmail.trim())) {
    return "The primary email does not look like an email address.";
  }
  if (!input.secondaryEmail.trim()) {
    return "A second email is required: both addresses receive order notifications.";
  }
  if (!looksLikeEmail(input.secondaryEmail.trim())) {
    return "The secondary email does not look like an email address.";
  }
  if (
    input.primaryEmail.trim().toLowerCase() ===
    input.secondaryEmail.trim().toLowerCase()
  ) {
    return "The two emails must be different, or the second one adds nothing.";
  }
  if (!["Active", "Suspended"].includes(input.status)) {
    return "That is not a supplier status we recognise.";
  }

  const lead = promisedNumber(input.promisedLeadTimeDays, 365);
  if (!lead.ok) return `Promised lead time: ${lead.error}`;
  const ack = promisedNumber(input.ackSlaHours, 720);
  if (!ack.ok) return `Acknowledgement window: ${ack.error}`;

  return null;
}

export async function createSupplier(
  input: SupplierEdit
): Promise<Result<string>> {
  const actor = await requireAdmin();

  const problem = validateSupplier(input);
  if (problem) return fail(problem);

  const companyName = input.companyName.trim();
  const clash = await db.supplier.findFirst({ where: { companyName } });
  if (clash) return fail(`There is already a supplier called ${companyName}.`);

  const supplier = await db.supplier.create({
    data: {
      companyName,
      primaryEmail: input.primaryEmail.trim(),
      secondaryEmail: input.secondaryEmail.trim(),
      phone: trim(input.phone),
      address: trim(input.address),
      trn: trim(input.trn),
      status: input.status,
      promisedLeadTimeDays: promisedValue(input.promisedLeadTimeDays, 365),
      // Defaulted in the schema, so only overridden when a figure was agreed.
      ...(promisedValue(input.ackSlaHours, 720) === null
        ? {}
        : { ackSlaHours: promisedValue(input.ackSlaHours, 720) as number }),
    },
  });

  await audit(actor, "supplier.create", "Supplier", supplier.id, undefined, {
    companyName,
  });
  await invalidateCatalog();
  return ok(supplier.id);
}

export async function updateSupplier(
  id: string,
  input: SupplierEdit
): Promise<Result> {
  const actor = await requireAdmin();

  const existing = await db.supplier.findUnique({ where: { id } });
  if (!existing) return fail("That supplier no longer exists.");

  const problem = validateSupplier(input);
  if (problem) return fail(problem);

  const companyName = input.companyName.trim();
  const clash = await db.supplier.findFirst({
    where: { companyName, NOT: { id } },
  });
  if (clash) return fail(`There is already a supplier called ${companyName}.`);

  const data = {
    companyName,
    primaryEmail: input.primaryEmail.trim(),
    secondaryEmail: input.secondaryEmail.trim(),
    phone: trim(input.phone),
    address: trim(input.address),
    trn: trim(input.trn),
    status: input.status,
    promisedLeadTimeDays: promisedValue(input.promisedLeadTimeDays, 365),
    // Falls back to the schema default rather than to null: the column is not
    // nullable, and 24 hours is the standing expectation when nothing else
    // has been agreed.
    ackSlaHours: promisedValue(input.ackSlaHours, 720) ?? 24,
  };

  const diff = changed(existing as unknown as Record<string, unknown>, data);
  await db.supplier.update({ where: { id }, data });

  await audit(actor, "supplier.update", "Supplier", id, diff.before, diff.after);
  await invalidateCatalog();
  return ok(undefined);
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

export async function createCategory(
  name: string,
  parentId: string | null
): Promise<Result<string>> {
  const actor = await requireAdmin();

  const clean = name.trim();
  if (!clean) return fail("A category needs a name.");

  if (parentId) {
    const parent = await db.category.findUnique({ where: { id: parentId } });
    if (!parent) return fail("That parent category no longer exists.");
    if (parent.parentId) {
      return fail("The tree is two levels deep: a department and its categories.");
    }
  }

  // Slugs are unique across the whole tree, not per parent. Two categories
  // sharing one makes the second unreachable — a defect found during the
  // rebuild, and the reason for the @unique on the column.
  const base = slugify(clean);
  let slug = base;
  for (let n = 2; await db.category.findUnique({ where: { slug } }); n += 1) {
    slug = `${base}-${n}`;
  }

  const last = await db.category.findFirst({
    where: { parentId },
    orderBy: { sortOrder: "desc" },
  });

  const category = await db.category.create({
    data: { name: clean, slug, parentId, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });

  await audit(actor, "category.create", "Category", category.id, undefined, {
    name: clean,
    slug,
    parentId,
  });
  await invalidateCatalog();
  return ok(category.id);
}

/**
 * Renaming does NOT change the slug. The slug is the URL: a category that has
 * been linked to, bookmarked or indexed keeps working, and the displayed name
 * is free to change. Changing both is a redirect problem, not a rename.
 */
export async function renameCategory(
  id: string,
  name: string
): Promise<Result> {
  const actor = await requireAdmin();

  const existing = await db.category.findUnique({ where: { id } });
  if (!existing) return fail("That category no longer exists.");

  const clean = name.trim();
  if (!clean) return fail("A category needs a name.");
  if (clean === existing.name) return ok(undefined);

  await db.category.update({ where: { id }, data: { name: clean } });

  await audit(
    actor,
    "category.rename",
    "Category",
    id,
    { name: existing.name },
    { name: clean }
  );
  await invalidateCatalog();
  return ok(undefined);
}

/**
 * Removing a category.
 *
 * The schema makes this quietly destructive: ProductCategory cascades on
 * delete, so removing a category takes its product links with it without a
 * word, and the parent relation is optional, so removing a department would
 * leave its subcategories pointing at nothing. Neither shows up as an error.
 * Both are guarded here rather than in the form, because a server action is a
 * public endpoint and a hidden button guards nothing.
 *
 * The guard that matters is not "does it hold products" — a product usually
 * sits in several categories and losing one is ordinary tidying. It is whether
 * a product would be left in NO category at all, because such a product falls
 * out of every browse path on the storefront while still being live, orderable
 * and invisible. That is the one outcome an admin cannot see happening and
 * would struggle to find afterwards.
 */
export async function deleteCategory(id: string): Promise<Result<string>> {
  const actor = await requireAdmin();

  const category = await db.category.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      children: { select: { id: true, name: true } },
      products: { select: { productMasterId: true } },
    },
  });
  if (!category) return fail("That category no longer exists.");

  // Subcategories first. Deleting the parent would silently promote them to
  // departments, which is a bigger change to the storefront than the one being
  // asked for, and not one anybody would connect to this click afterwards.
  if (category.children.length > 0) {
    const names = category.children.map((c) => c.name).join(", ");
    return fail(
      `${category.name} still holds ${category.children.length} ` +
        `${category.children.length === 1 ? "subcategory" : "subcategories"} ` +
        `(${names}). Remove or move ${category.children.length === 1 ? "it" : "them"} first.`
    );
  }

  const productIds = category.products.map((p) => p.productMasterId);

  if (productIds.length > 0) {
    // Which of them are in this category and nowhere else.
    const counts = await db.productCategory.groupBy({
      by: ["productMasterId"],
      where: { productMasterId: { in: productIds } },
      _count: { categoryId: true },
    });
    const orphanIds = counts
      .filter((row) => row._count.categoryId <= 1)
      .map((row) => row.productMasterId);

    if (orphanIds.length > 0) {
      const orphans = await db.productMaster.findMany({
        where: { id: { in: orphanIds } },
        select: { name: true },
        take: 4,
        orderBy: { name: "asc" },
      });
      const shown = orphans.map((p) => p.name).join(", ");
      const more =
        orphanIds.length > orphans.length
          ? ` and ${orphanIds.length - orphans.length} more`
          : "";
      return fail(
        `${orphanIds.length} ${orphanIds.length === 1 ? "product is" : "products are"} ` +
          `only in ${category.name} (${shown}${more}). Deleting it would leave ` +
          `${orphanIds.length === 1 ? "it" : "them"} in no category at all — still ` +
          `on sale, but reachable only by search. Put ${orphanIds.length === 1 ? "it" : "them"} ` +
          `in another category first.`
      );
    }
  }

  await db.category.delete({ where: { id } });

  await audit(
    actor,
    "category.delete",
    "Category",
    id,
    {
      name: category.name,
      slug: category.slug,
      parentId: category.parentId,
      // The links that went with it, so the deletion can be understood — and
      // undone by hand — from the log alone.
      productsUncategorised: productIds.length,
    },
    undefined
  );
  await invalidateCatalog();
  return ok(category.name);
}

/**
 * Clearing out the empty ones.
 *
 * The catalogue import creates the supplier's whole taxonomy whether or not we
 * stock anything in it, so the tree carries well over a hundred categories
 * holding nothing. They are filtered out of the browse menu but still fill the
 * search scope dropdown and the admin's own screen, and removing them one at a
 * time is not a feature, it is a chore.
 *
 * Empty leaves are removed repeatedly rather than in one pass, so a department
 * whose every subcategory was empty goes too, in the same run. Without the
 * loop it would survive as an empty department and need a second click, which
 * reads as the button not having worked.
 */
export async function deleteEmptyCategories(): Promise<Result<number>> {
  const actor = await requireAdmin();

  const removed: { id: string; name: string; slug: string }[] = [];

  // Bounded rather than while(true): the tree is two deep by construction, so
  // three passes is already more than can be needed, and a loop that cannot
  // terminate has no place in a delete.
  for (let pass = 0; pass < 4; pass += 1) {
    const empty = await db.category.findMany({
      where: { products: { none: {} }, children: { none: {} } },
      select: { id: true, name: true, slug: true },
    });
    if (empty.length === 0) break;

    await db.category.deleteMany({ where: { id: { in: empty.map((c) => c.id) } } });
    removed.push(...empty);
  }

  if (removed.length === 0) return ok(0);

  await audit(
    actor,
    "category.deleteEmpty",
    "Category",
    // Not one row, so the entity id records the shape of the action instead.
    `${removed.length} categories`,
    { removed: removed.map((c) => `${c.name} (/${c.slug})`) },
    undefined
  );
  await invalidateCatalog();
  return ok(removed.length);
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export async function setOrderStatus(
  reference: string,
  status: string
): Promise<Result> {
  const actor = await requireAdmin();

  if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
    return fail("That is not an order status we recognise.");
  }

  const order = await db.order.findUnique({ where: { reference } });
  if (!order) return fail("That order no longer exists.");
  if (order.status === status) return ok(undefined);

  // A delivered order is a closed document. Reopening it would let the status
  // contradict what the customer has already received.
  if (order.status === "Delivered" && status !== "Delivered") {
    return fail("A delivered order cannot be moved back. Raise a return instead.");
  }
  if (order.status === "Cancelled" && status !== "Cancelled") {
    return fail("A cancelled order cannot be reopened. Place a new order.");
  }

  await db.order.update({ where: { reference }, data: { status } });

  await audit(
    actor,
    "order.status",
    "Order",
    order.id,
    { status: order.status },
    { status }
  );

  // Alongside the audit entry, not instead of it: the audit is for
  // accountability and this is for measurement. See BE-30.
  await recordStatus({
    entity: "Order",
    entityId: order.id,
    entityRef: order.reference,
    fromStatus: order.status,
    toStatus: status,
    actor: { id: actor.id, name: actor.name, role: "Admin" },
  });

  // Orders are not part of the catalogue, so no cache bump is needed here.
  return ok(undefined);
}

/**
 * Fulfilment on one line.
 *
 * The order's own status is left alone here on purpose. A line moving to
 * Shipped does not mean the order shipped — that is exactly the case an
 * order-level status gets wrong, and telling a customer their whole order is
 * on its way when one line is on backorder is worse than saying nothing.
 */
export async function setOrderLineStatus(
  itemId: string,
  status: string
): Promise<Result> {
  const actor = await requireAdmin();

  if (
    !ORDER_LINE_STATUSES.includes(status as (typeof ORDER_LINE_STATUSES)[number])
  ) {
    return fail("That is not a line status we recognise.");
  }

  const item = await db.orderItem.findUnique({
    where: { id: itemId },
    include: { order: { select: { status: true, reference: true } } },
  });
  if (!item) return fail("That order line no longer exists.");
  if (item.status === status) return ok(undefined);

  if (item.order.status === "Cancelled" && status !== "Cancelled") {
    return fail("The order is cancelled, so its lines cannot be worked on.");
  }

  await db.orderItem.update({ where: { id: itemId }, data: { status } });

  await audit(
    actor,
    "orderLine.status",
    "OrderItem",
    itemId,
    { status: item.status },
    { status, order: item.order.reference }
  );

  // Per line, because an order-level status cannot say that one line sat on
  // backorder for a fortnight while the rest shipped the same day — and that
  // is the number worth having.
  await recordStatus({
    entity: "OrderItem",
    entityId: itemId,
    entityRef: `${item.order.reference} · ${item.skuCodeSnapshot}`,
    fromStatus: item.status,
    toStatus: status,
    actor: { id: actor.id, name: actor.name, role: "Admin" },
  });

  return ok(undefined);
}

/**
 * Lot and expiry against a line.
 *
 * This is the record a recall is answered from: "which customers received
 * batch X" can only be answered if the batch was written down at the moment
 * the goods were picked, not inferred from stock levels afterwards.
 */
export async function setOrderLineBatch(
  itemId: string,
  batchCode: string | null,
  expiresOn: string | null
): Promise<Result> {
  const actor = await requireAdmin();

  const item = await db.orderItem.findUnique({ where: { id: itemId } });
  if (!item) return fail("That order line no longer exists.");

  let expires: Date | null = null;
  if (expiresOn) {
    const parsed = new Date(expiresOn);
    if (Number.isNaN(parsed.getTime())) return fail("That expiry date is not a date.");
    expires = parsed;
  }
  if (expires && !batchCode?.trim()) {
    return fail("An expiry date needs the batch it belongs to.");
  }

  const data = {
    batchCodeSnapshot: trim(batchCode),
    expiresOnSnapshot: expires,
  };

  await db.orderItem.update({ where: { id: itemId }, data });

  await audit(
    actor,
    "orderLine.batch",
    "OrderItem",
    itemId,
    {
      batchCodeSnapshot: item.batchCodeSnapshot,
      expiresOnSnapshot: item.expiresOnSnapshot,
    },
    data
  );
  return ok(undefined);
}

/**
 * Payment, recorded against the order rather than inferred from it.
 *
 * `paidFils` is the amount actually received, so a part payment on a credit
 * account is a fact rather than a guess. Marking an order Paid stamps the
 * moment it happened, because "when" is the question an aged receivables
 * report is built from.
 */
export async function setOrderPayment(
  reference: string,
  paymentStatus: string,
  paidAED: number | null,
  dueOn: string | null
): Promise<Result> {
  const actor = await requireAdmin();

  if (
    !PAYMENT_STATUSES.includes(paymentStatus as (typeof PAYMENT_STATUSES)[number])
  ) {
    return fail("That is not a payment status we recognise.");
  }

  const order = await db.order.findUnique({ where: { reference } });
  if (!order) return fail("That order no longer exists.");

  const paidFils =
    paidAED === null || Number.isNaN(paidAED) ? order.paidFils : toFils(paidAED);
  if (paidFils < 0) return fail("A payment cannot be negative.");
  if (paidFils > order.totalFils && paymentStatus !== "Refunded") {
    return fail(
      `That is more than the order total of ${(order.totalFils / 100).toFixed(2)}. Record an overpayment as a refund instead.`
    );
  }
  if (paymentStatus === "PartiallyPaid" && paidFils <= 0) {
    return fail("A part payment needs the amount that was received.");
  }

  let due: Date | null = order.paymentDueOn;
  if (dueOn !== null) {
    if (dueOn === "") due = null;
    else {
      const parsed = new Date(dueOn);
      if (Number.isNaN(parsed.getTime())) return fail("That due date is not a date.");
      due = parsed;
    }
  }

  const data = {
    paymentStatus,
    paidFils: paymentStatus === "Paid" ? order.totalFils : paidFils,
    // Stamp the moment it was settled, and clear it if it is unsettled again.
    paidAt:
      paymentStatus === "Paid"
        ? (order.paidAt ?? new Date())
        : paymentStatus === "Unpaid"
          ? null
          : order.paidAt,
    paymentDueOn: due,
  };

  await db.order.update({ where: { reference }, data });

  await audit(
    actor,
    "order.payment",
    "Order",
    order.id,
    {
      paymentStatus: order.paymentStatus,
      paidFils: order.paidFils,
      paymentDueOn: order.paymentDueOn,
    },
    data
  );
  return ok(undefined);
}

/** Courier, tracking and the date the warehouse expects to ship. */
export async function setOrderDelivery(
  reference: string,
  input: {
    deliveryType: string;
    courier: string | null;
    trackingNumber: string | null;
    estimatedShipmentOn: string | null;
  }
): Promise<Result> {
  const actor = await requireAdmin();

  if (!["Delivery", "PickUp"].includes(input.deliveryType)) {
    return fail("That is not a delivery type we recognise.");
  }

  const order = await db.order.findUnique({ where: { reference } });
  if (!order) return fail("That order no longer exists.");

  let shipOn: Date | null = null;
  if (input.estimatedShipmentOn) {
    const parsed = new Date(input.estimatedShipmentOn);
    if (Number.isNaN(parsed.getTime())) return fail("That ship date is not a date.");
    shipOn = parsed;
  }

  const data = {
    deliveryType: input.deliveryType,
    courier: trim(input.courier),
    trackingNumber: trim(input.trackingNumber),
    estimatedShipmentOn: shipOn,
  };

  const diff = changed(order as unknown as Record<string, unknown>, data);
  await db.order.update({ where: { reference }, data });

  await audit(actor, "order.delivery", "Order", order.id, diff.before, diff.after);
  return ok(undefined);
}

/** Staff-only notes. The customer never sees these. */
export async function setOrderInternalNotes(
  reference: string,
  notes: string | null
): Promise<Result> {
  const actor = await requireAdmin();

  const order = await db.order.findUnique({ where: { reference } });
  if (!order) return fail("That order no longer exists.");

  await db.order.update({
    where: { reference },
    data: { internalNotes: trim(notes) },
  });

  await audit(
    actor,
    "order.notes",
    "Order",
    order.id,
    { internalNotes: order.internalNotes },
    { internalNotes: trim(notes) }
  );
  return ok(undefined);
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

/**
 * The VAT rate is stored in basis points so it is an integer: 500 is 5%.
 * Historical orders keep the rate in force when they were placed, so changing
 * this cannot rewrite a document a customer already holds.
 */
export async function setVatRate(percent: number): Promise<Result> {
  const actor = await requireAdmin();

  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return fail("The VAT rate must be a percentage between 0 and 100.");
  }
  const basisPoints = Math.round(percent * 100);

  const existing = await db.setting.findUnique({
    where: { key: "vatRateBasisPoints" },
  });

  await db.setting.upsert({
    where: { key: "vatRateBasisPoints" },
    update: { value: String(basisPoints) },
    create: { key: "vatRateBasisPoints", value: String(basisPoints) },
  });

  await audit(
    actor,
    "setting.update",
    "Setting",
    "vatRateBasisPoints",
    { value: existing?.value ?? null },
    { value: String(basisPoints) }
  );
  await invalidateCatalog();
  return ok(undefined);
}
