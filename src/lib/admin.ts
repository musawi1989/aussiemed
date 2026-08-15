import "server-only";

import { invalidateCatalog } from "./catalog";
import { db } from "./db";
import { getSessionUser, type SessionUser } from "./auth";

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
async function audit(
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
  supplierId: string;
  taxClass: string;
  variantGroup: string | null;
  variantLabel: string | null;
  categoryIds: string[];
};

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

  const supplier = await db.supplier.findUnique({
    where: { id: input.supplierId },
  });
  if (!supplier) return fail("That supplier no longer exists.");

  // A product with no category is unreachable by browsing: it exists, it is
  // searchable, and no amount of clicking will ever find it.
  if (input.categoryIds.length === 0) {
    return fail("Choose at least one category, or nobody can browse to it.");
  }

  const data = {
    name,
    description: trim(input.description),
    brandId: input.brandId || null,
    supplierId: input.supplierId,
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
  return ok(undefined);
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
  address: string | null;
  trn: string | null;
  status: string;
};

/**
 * secondaryEmail is mandatory at creation. That is a platform decision, not a
 * form nicety — both addresses receive order notifications, and a supplier
 * with one contact is a supplier whose orders go unread when that person is
 * away. The column stays nullable for rows that predate the rule, so it is
 * enforced here rather than in the schema.
 */
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

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export const ORDER_STATUSES = [
  "Pending",
  "Processing",
  "Dispatched",
  "Delivered",
  "Cancelled",
] as const;

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
  // Orders are not part of the catalogue, so no cache bump is needed here.
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
