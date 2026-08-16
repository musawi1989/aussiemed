import "server-only";

import { db } from "./db";
import { getSessionUser, type SessionUser } from "./auth";
import { accountMetrics, type AccountMetrics } from "./account-metrics";

/**
 * The customer's own account: their orders, their branches, their staff, and
 * the products they have kept.
 *
 * Every query is scoped by the organisation on the session and never by an id
 * from the caller, for the same reason the supplier portal is: a customer must
 * not be able to reach another customer's account by changing a value. Nothing
 * exported here takes an organisation id.
 */

export type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

const trim = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
};

export type AccountSession = SessionUser & { organisationId: string };

/** The signed-in buyer, or null. A personal account has no organisation. */
export async function accountSession(): Promise<AccountSession | null> {
  const user = await getSessionUser();
  if (!user || user.role !== "Customer" || !user.organisationId) return null;
  return user as AccountSession;
}

async function requireAccount(): Promise<AccountSession> {
  const session = await accountSession();
  if (!session) throw new Error("Trade account required");
  return session;
}

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */

export async function accountOverview(): Promise<{
  metrics: AccountMetrics;
  organisationName: string;
} | null> {
  const session = await accountSession();
  if (!session) return null;

  const [orders, organisation] = await Promise.all([
    db.order.findMany({
      where: { organisationId: session.organisationId, status: { not: "Cancelled" } },
      select: { placedAt: true, totalFils: true },
    }),
    db.organisation.findUnique({
      where: { id: session.organisationId },
      select: { name: true },
    }),
  ]);

  return {
    metrics: accountMetrics(
      orders.map((o) => ({ placedAt: o.placedAt.getTime(), totalFils: o.totalFils })),
      Date.now()
    ),
    organisationName: organisation?.name ?? "Your account",
  };
}

/* ------------------------------------------------------------------ *
 * Orders, by branch
 * ------------------------------------------------------------------ */

/**
 * Their orders, optionally for one branch.
 *
 * A practice with three sites wants each site's ordering kept apart most of
 * the time and all of it together when they are looking at the whole account,
 * so the branch is a filter rather than a separate list.
 */
export async function accountOrders(branchId?: string) {
  const session = await requireAccount();

  return db.order.findMany({
    where: {
      organisationId: session.organisationId,
      ...(branchId ? { addressId: branchId } : {}),
    },
    orderBy: { placedAt: "desc" },
    take: 100,
    include: {
      address: { select: { id: true, label: true, city: true } },
      staff: { select: { name: true } },
      items: { select: { id: true } },
    },
  });
}

/* ------------------------------------------------------------------ *
 * Branches
 * ------------------------------------------------------------------ */

export async function accountBranches(includeArchived = false) {
  const session = await requireAccount();

  return db.address.findMany({
    where: {
      organisationId: session.organisationId,
      ...(includeArchived ? {} : { isArchived: false }),
    },
    orderBy: [{ isDefault: "desc" }, { label: "asc" }],
    include: { _count: { select: { orders: true } } },
  });
}

export type BranchInput = {
  label: string;
  contact: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  emirate: string;
};

export async function addBranch(input: BranchInput): Promise<Result> {
  const session = await requireAccount();

  const label = trim(input.label);
  const contact = trim(input.contact);
  const line1 = trim(input.line1);
  const city = trim(input.city);

  if (!label) return fail("Give the branch a name you will recognise.");
  if (!contact) return fail("Who should the driver ask for?");
  if (!line1) return fail("The delivery address is needed.");
  if (!city) return fail("Which city is it in?");

  const existing = await db.address.count({
    where: { organisationId: session.organisationId },
  });

  await db.address.create({
    data: {
      organisationId: session.organisationId,
      label,
      contact,
      phone: trim(input.phone) ?? "",
      line1,
      line2: trim(input.line2),
      city,
      emirate: trim(input.emirate) ?? "",
      // The first one added is the default, so a single-site customer never
      // has to think about it.
      isDefault: existing === 0,
    },
  });

  return ok(undefined);
}

/** Archived, not deleted — orders delivered there still name it. */
export async function archiveBranch(branchId: string): Promise<Result> {
  const session = await requireAccount();

  const branch = await db.address.findFirst({
    where: { id: branchId, organisationId: session.organisationId },
  });
  if (!branch) return fail("That branch is not on your account.");

  const remaining = await db.address.count({
    where: { organisationId: session.organisationId, isArchived: false },
  });
  if (remaining <= 1) {
    return fail("This is your only branch — add another before removing it.");
  }

  await db.address.update({
    where: { id: branchId },
    data: { isArchived: true, isDefault: false },
  });

  return ok(undefined);
}

/* ------------------------------------------------------------------ *
 * Staff
 * ------------------------------------------------------------------ */

export async function accountStaff(includeInactive = false) {
  const session = await requireAccount();

  return db.organisationStaff.findMany({
    where: {
      organisationId: session.organisationId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { orders: true } } },
  });
}

export async function addStaff(name: string, email: string): Promise<Result> {
  const session = await requireAccount();

  const cleanName = trim(name);
  if (!cleanName) return fail("A name is needed.");

  const existing = await db.organisationStaff.findFirst({
    where: { organisationId: session.organisationId, name: cleanName },
  });

  if (existing) {
    // Re-adding someone who was removed brings them back rather than failing
    // on a constraint the person cannot see.
    if (!existing.isActive) {
      await db.organisationStaff.update({
        where: { id: existing.id },
        data: { isActive: true, email: trim(email) },
      });
      return ok(undefined);
    }
    return fail(`${cleanName} is already on the list.`);
  }

  await db.organisationStaff.create({
    data: {
      organisationId: session.organisationId,
      name: cleanName,
      email: trim(email),
    },
  });

  return ok(undefined);
}

/** Removed from the picker, keeping the orders they placed. */
export async function removeStaff(staffId: string): Promise<Result> {
  const session = await requireAccount();

  const staff = await db.organisationStaff.findFirst({
    where: { id: staffId, organisationId: session.organisationId },
  });
  if (!staff) return fail("That person is not on your account.");

  await db.organisationStaff.update({
    where: { id: staffId },
    data: { isActive: false },
  });

  return ok(undefined);
}

/* ------------------------------------------------------------------ *
 * Reordering
 * ------------------------------------------------------------------ */

export type ReorderLine = {
  skuCode: string;
  name: string;
  unitLabel: string;
  qty: number;
  /** False when the pack has since been retired or gone out of stock. */
  available: boolean;
  reason: string | null;
  priceFils: number | null;
};

export type ReorderPreview = {
  reference: string;
  placedAt: Date;
  lines: ReorderLine[];
  cartCount: number;
};

/**
 * What a past order would put back in the basket.
 *
 * Priced from the catalogue today, not from the order: repeating last month's
 * order at last month's prices would be a quote nobody agreed to. Lines that
 * can no longer be bought are shown and marked rather than dropped, because a
 * buyer repeating an order needs to know something is missing from it — that
 * is exactly the moment they would otherwise not notice.
 */
export async function reorderPreview(
  reference: string,
  cartKey: string | null
): Promise<ReorderPreview | null> {
  const session = await accountSession();
  if (!session) return null;

  const order = await db.order.findFirst({
    where: { reference, organisationId: session.organisationId },
    include: { items: { orderBy: { nameSnapshot: "asc" } } },
  });
  if (!order) return null;

  const skus = await db.productSku.findMany({
    where: { skuCode: { in: order.items.map((i) => i.skuCodeSnapshot) } },
    select: {
      skuCode: true,
      priceFils: true,
      isActive: true,
      manualOutOfStock: true,
      product: { select: { status: true } },
    },
  });
  const bySkuCode = new Map(skus.map((s) => [s.skuCode, s]));

  const lines: ReorderLine[] = order.items.map((item) => {
    const sku = bySkuCode.get(item.skuCodeSnapshot);
    const listed = sku && sku.isActive && sku.product.status === "Active";

    return {
      skuCode: item.skuCodeSnapshot,
      name: item.nameSnapshot,
      unitLabel: item.unitLabelSnapshot,
      qty: item.qty,
      available: Boolean(listed) && !sku?.manualOutOfStock,
      reason: !listed
        ? "No longer listed"
        : sku?.manualOutOfStock
          ? "Out of stock"
          : null,
      priceFils: listed ? (sku?.priceFils ?? null) : null,
    };
  });

  const cart = cartKey
    ? await db.cart.findUnique({
        where: { cartKey },
        include: { _count: { select: { items: true } } },
      })
    : null;

  return {
    reference: order.reference,
    placedAt: order.placedAt,
    lines,
    cartCount: cart?._count.items ?? 0,
  };
}
/* ------------------------------------------------------------------ *
 * Saved products
 * ------------------------------------------------------------------ */

export type SavedGroup = {
  categoryId: string | null;
  categoryName: string;
  products: {
    id: string;
    name: string;
    slug: string;
    image: string | null;
    priceFils: number | null;
    outOfStock: boolean;
  }[];
};

/**
 * Their saved products, grouped by the category each one belongs to.
 *
 * Only categories with something in them: a list of empty headings is the
 * whole catalogue tree pretending to be a personal list.
 */
export async function savedProducts(): Promise<SavedGroup[]> {
  const session = await accountSession();
  if (!session) return [];

  const saved = await db.wishlistItem.findMany({
    where: { userId: session.id },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { path: true } },
          categories: {
            include: { category: { select: { id: true, name: true } } },
          },
          skus: {
            where: { isActive: true },
            orderBy: { eachesPerPack: "asc" },
            take: 1,
            select: { priceFils: true, manualOutOfStock: true },
          },
        },
      },
    },
  });

  const groups = new Map<string, SavedGroup>();

  for (const row of saved) {
    // The deepest category is the specific one — "Gloves" rather than
    // "Medical Consumables", which is what a person is actually browsing by.
    const category = row.product.categories.at(-1)?.category ?? null;
    const key = category?.id ?? "uncategorised";

    const group =
      groups.get(key) ??
      {
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? "Everything else",
        products: [],
      };

    group.products.push({
      id: row.product.id,
      name: row.product.name,
      slug: row.product.slug,
      image: row.product.images[0]?.path ?? null,
      priceFils: row.product.skus[0]?.priceFils ?? null,
      outOfStock: row.product.skus[0]?.manualOutOfStock ?? false,
    });

    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) =>
    a.categoryName.localeCompare(b.categoryName)
  );
}
