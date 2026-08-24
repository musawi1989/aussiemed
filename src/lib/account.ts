import "server-only";

import { db } from "./db";
import { getSessionUser, type SessionUser } from "./auth";
import { accountMetrics, type AccountMetrics } from "./account-metrics";
import { checkBranch } from "./account-change-plan";
import {
  accountChanges,
  pendingCountFor,
  pendingForTargets,
  submitChange,
  withdrawChange,
} from "./account-changes";

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

export async function accountOverview(branchId?: string): Promise<{
  metrics: AccountMetrics;
  organisationName: string;
} | null> {
  const session = await accountSession();
  if (!session) return null;

  const [orders, organisation] = await Promise.all([
    db.order.findMany({
      // Narrowed to one site when asked. A practice manager looking at
      // Jumeirah wants Jumeirah's numbers, not the group's with Jumeirah's
      // orders listed underneath — the two disagreeing on one screen is worse
      // than either alone.
      where: {
        organisationId: session.organisationId,
        status: { not: "Cancelled" },
        ...(branchId ? { addressId: branchId } : {}),
      },
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

/**
 * Just enough to prefill a form: who they are and who they buy for.
 *
 * Deliberately lighter than accountOverview, which reads every order to work
 * out the figures. Checkout only needs the two names.
 */
export async function accountIdentity(): Promise<{
  organisationName: string;
  contactName: string;
  email: string;
  /** What this account was agreed, so checkout can state its own due date
   *  rather than asserting the default at everybody. */
  paymentTerms: string;
} | null> {
  const session = await accountSession();
  if (!session) return null;

  const organisation = await db.organisation.findUnique({
    where: { id: session.organisationId },
    select: { name: true, paymentTerms: true },
  });

  return {
    organisationName: organisation?.name ?? "",
    contactName: session.name,
    email: session.email,
    paymentTerms: organisation?.paymentTerms ?? "Prepaid",
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
      // Line status as well as the count: the order-level status has to pick
      // one word, and "On the way" is only true of the lines that went. See
      // splitDeliveryNote.
      items: { select: { id: true, status: true } },
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

/**
 * Branch changes are requested, not made.
 *
 * A branch is a place we deliver medical supplies to. Letting an account add
 * one and have it live immediately means the next order can go to an address
 * nobody at AussieMed has ever checked, and the customer finds out when the
 * goods do not arrive. So these three write a request and return; an admin
 * approving it is what creates, edits or archives the address. See
 * account-change-plan for which kinds are held and why.
 */
export async function requestAddBranch(
  input: BranchInput,
  reason: string
): Promise<Result<{ applied: boolean }>> {
  const session = await requireAccount();

  const branch = checkBranch(input);
  if (!branch.ok) return fail(branch.error);

  return submitChange({
    organisationId: session.organisationId,
    kind: "BranchAdded",
    subject: branch.branch.label,
    reason,
    payload: branch.branch,
    actor: { id: session.id, name: session.name },
  });
}

export async function requestEditBranch(
  branchId: string,
  input: BranchInput,
  reason: string
): Promise<Result<{ applied: boolean }>> {
  const session = await requireAccount();

  const existing = await db.address.findFirst({
    where: { id: branchId, organisationId: session.organisationId },
  });
  if (!existing) return fail("That branch is not on your account.");

  const branch = checkBranch(input);
  if (!branch.ok) return fail(branch.error);

  // One request per branch at a time. Two pending edits would be applied in
  // whichever order an admin happened to click them, and the customer would
  // have no way to know which one won.
  const queued = await db.accountChange.findFirst({
    where: { targetId: branchId, status: "Pending" },
  });
  if (queued) {
    return fail("A change to this branch is already waiting for approval.");
  }

  return submitChange({
    organisationId: session.organisationId,
    kind: "BranchEdited",
    subject: branch.branch.label,
    reason,
    payload: branch.branch,
    targetId: branchId,
    actor: { id: session.id, name: session.name },
  });
}

export async function requestRemoveBranch(
  branchId: string,
  reason: string
): Promise<Result<{ applied: boolean }>> {
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

  const queued = await db.accountChange.findFirst({
    where: { targetId: branchId, status: "Pending" },
  });
  if (queued) {
    return fail("A change to this branch is already waiting for approval.");
  }

  return submitChange({
    organisationId: session.organisationId,
    kind: "BranchRemoved",
    subject: branch.label ?? branch.city,
    reason,
    targetId: branchId,
    actor: { id: session.id, name: session.name },
  });
}

/** The name that goes on their invoices, so this is checked before it moves. */
export async function requestRenameAccount(
  name: string,
  reason: string
): Promise<Result<{ applied: boolean }>> {
  const session = await requireAccount();

  const clean = (name ?? "").trim().replace(/\s+/g, " ");
  if (clean.length < 2) return fail("Give the account a name.");

  const organisation = await db.organisation.findUnique({
    where: { id: session.organisationId },
    select: { name: true },
  });
  if (organisation?.name === clean) {
    return fail("That is already the name on the account.");
  }

  const queued = await db.accountChange.findFirst({
    where: {
      organisationId: session.organisationId,
      kind: "AccountRenamed",
      status: "Pending",
    },
  });
  if (queued) return fail("A name change is already waiting for approval.");

  return submitChange({
    organisationId: session.organisationId,
    kind: "AccountRenamed",
    subject: clean,
    reason,
    // The rename travels in the same shape as a branch so one reviewer screen
    // can read every payload without knowing what kind it is looking at.
    payload: { label: clean },
    actor: { id: session.id, name: session.name },
  });
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
    include: {
      _count: { select: { orders: true } },
      address: { select: { id: true, label: true, city: true } },
    },
  });
}

/**
 * A name, and nothing else.
 *
 * Staff here are a record of who asked for what, not accounts — nobody gets a
 * sign-in, so there is nothing an email address would be used for. The column
 * still exists on `OrganisationStaff` and is no longer written; dropping it is
 * registered rather than done here, so a migration is not needed for a UI
 * change.
 *
 * These take effect at once and are logged with the reason. The list is the
 * account's own and affects nothing outside it, and holding "she has left"
 * for approval would mean an order going out in the name of someone who no
 * longer works there.
 */
export async function addStaff(
  name: string,
  reason: string,
  addressId: string
): Promise<Result<{ applied: boolean }>> {
  const session = await requireAccount();

  const cleanName = trim(name);
  if (!cleanName) return fail("A name is needed.");

  // Checked against this account's own branches, not trusted from the form.
  // A server action is a public endpoint, and an id posted from elsewhere
  // would otherwise attach one account's staff to another's site.
  const branch = await db.address.findFirst({
    where: {
      id: addressId,
      organisationId: session.organisationId,
      isArchived: false,
    },
    select: { id: true, label: true, city: true },
  });
  if (!branch) {
    return fail("Choose which branch they order for.");
  }

  const existing = await db.organisationStaff.findFirst({
    where: { organisationId: session.organisationId, name: cleanName },
  });
  if (existing?.isActive) return fail(`${cleanName} is already on the list.`);

  return submitChange({
    organisationId: session.organisationId,
    kind: "StaffAdded",
    subject: `${cleanName} (${branch.label ?? branch.city})`,
    reason,
    actor: { id: session.id, name: session.name },
    apply: async () => {
      if (existing) {
        // Re-adding someone who was removed brings them back rather than
        // failing on a constraint the person cannot see.
        await db.organisationStaff.update({
          where: { id: existing.id },
          data: { isActive: true, addressId: branch.id },
        });
        return;
      }
      await db.organisationStaff.create({
        data: {
          organisationId: session.organisationId,
          name: cleanName,
          addressId: branch.id,
        },
      });
    },
  });
}

/** Removed from the picker, keeping the orders they placed. */
export async function removeStaff(
  staffId: string,
  reason: string
): Promise<Result<{ applied: boolean }>> {
  const session = await requireAccount();

  const staff = await db.organisationStaff.findFirst({
    where: { id: staffId, organisationId: session.organisationId },
  });
  if (!staff) return fail("That person is not on your account.");

  return submitChange({
    organisationId: session.organisationId,
    kind: "StaffRemoved",
    subject: staff.name,
    reason,
    targetId: staffId,
    actor: { id: session.id, name: session.name },
    apply: async () => {
      await db.organisationStaff.update({
        where: { id: staffId },
        data: { isActive: false },
      });
    },
  });
}

/* ------------------------------------------------------------------ *
 * The change log
 * ------------------------------------------------------------------ */

/**
 * Wrappers, so the organisation id stays off the caller here too. The
 * underlying functions take one because the admin side needs to read across
 * accounts; nothing the customer reaches does.
 */

export async function accountChangeLog(branchId?: string) {
  const session = await requireAccount();
  return accountChanges(session.organisationId, branchId);
}

export async function accountPendingByTarget() {
  const session = await accountSession();
  if (!session) return new Map();
  return pendingForTargets(session.organisationId);
}

export async function accountPendingCount(): Promise<number> {
  const session = await accountSession();
  if (!session) return 0;
  return pendingCountFor(session.organisationId);
}

export async function withdrawAccountChange(changeId: string): Promise<Result> {
  const session = await requireAccount();
  return withdrawChange(changeId, session.organisationId);
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

/**
 * Saves or unsaves a product for the signed-in account.
 *
 * Addressed by slug because the browser knows the catalogue's own numeric ids,
 * not database ones, and the slug is the stable public address of a product —
 * DEC-17 already guarantees it never changes under a rename.
 *
 * A guest gets `signedIn: false` rather than an error: their hearts still work
 * in this browser, they simply do not follow them to another one.
 */
export async function toggleSavedProduct(
  slug: string
): Promise<Result<{ signedIn: boolean; saved: boolean }>> {
  const user = await getSessionUser();
  if (!user || user.role !== "Customer") {
    return ok({ signedIn: false, saved: false });
  }

  const product = await db.productMaster.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!product) return fail("That product is no longer listed.");

  const existing = await db.wishlistItem.findFirst({
    where: { userId: user.id, productMasterId: product.id },
    select: { id: true },
  });

  if (existing) {
    await db.wishlistItem.delete({ where: { id: existing.id } });
    return ok({ signedIn: true, saved: false });
  }

  await db.wishlistItem.create({
    data: { userId: user.id, productMasterId: product.id },
  });
  return ok({ signedIn: true, saved: true });
}

/** The catalogue ids of everything this account has saved, for the store. */
export async function savedProductSlugs(): Promise<string[]> {
  const user = await getSessionUser();
  if (!user || user.role !== "Customer") return [];

  const saved = await db.wishlistItem.findMany({
    where: { userId: user.id },
    select: { product: { select: { slug: true } } },
  });

  return saved.map((row) => row.product.slug);
}

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
    /** What quick-buy adds. Null when the product has no active SKU left. */
    skuCode: string | null;
    /** "Box" — the unit the quantity counts, so +1 is not ambiguous. */
    unitShortLabel: string | null;
    /** "100 Pieces/Box" — what one of those units actually contains. */
    unitLabel: string | null;
  }[];
};

/**
 * Their saved products, grouped by the category each one belongs to.
 *
 * Only categories with something in them: a list of empty headings is the
 * whole catalogue tree pretending to be a personal list.
 */
/*
 * This took a branchId until 23 Aug 2026 and no longer does — the client took
 * the branch filter off My products. What it used to do, in case it is ever
 * wanted back: it kept the saved products that appear on an order for that
 * branch, because "My products for Jumeirah" means "which of these does
 * Jumeirah order" rather than anything a wishlist stores. It cost a second
 * query, and with the control gone it was work done for nobody.
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
          // Smallest pack first: quick-buy should reach for the box, not the
          // pallet. Anyone wanting a bigger unit opens the product.
          skus: {
            where: { isActive: true },
            orderBy: { eachesPerPack: "asc" },
            take: 1,
            select: {
              skuCode: true,
              unitShortLabel: true,
              unitLabel: true,
              priceFils: true,
              manualOutOfStock: true,
            },
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
      skuCode: row.product.skus[0]?.skuCode ?? null,
      unitShortLabel: row.product.skus[0]?.unitShortLabel ?? null,
      unitLabel: row.product.skus[0]?.unitLabel ?? null,
    });

    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) =>
    a.categoryName.localeCompare(b.categoryName)
  );
}
