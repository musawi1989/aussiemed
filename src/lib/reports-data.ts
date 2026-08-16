import "server-only";

import { db } from "./db";
import { requireAdmin } from "./admin";
import { historiesOf } from "./status-events";
import { onTimeRate, summarise, timeBetween, type Summary } from "./lifecycle";
import { bucketByMonth, isAbandoned, type MonthBucket } from "./reporting";

/**
 * The figures behind the report screens — BE-27, BE-28.
 *
 * Admin-guarded, like margin-data.ts and for the same reason: cost and margin
 * appear here, and the guarantee that they stay inside the admin is that
 * nothing outside it imports this file.
 *
 * Everything is read for a window and aggregated in memory rather than pushed
 * into SQL. At this size that is faster to write, easier to test through the
 * pure helpers, and portable — the database is SQLite today and Postgres
 * later, and a report full of dialect-specific date functions is the last
 * thing anyone wants to port. If a window ever grows past what fits
 * comfortably, that is the moment to move it, not before.
 */

const MONTHS = 12;

/* ------------------------------------------------------------------ *
 * Customers
 * ------------------------------------------------------------------ */

export type MonthSales = {
  key: string;
  label: string;
  orders: number;
  revenueFils: number;
};

export type AccountRow = {
  organisationId: string;
  name: string;
  orders: number;
  spendFils: number;
  averageFils: number;
  lastOrderAt: Date | null;
};

export type CategoryRow = {
  name: string;
  units: number;
  revenueFils: number;
};

export type SavedRow = {
  productId: string;
  name: string;
  slug: string;
  savedBy: number;
  /** Whether it can currently be bought at all. */
  listed: boolean;
};

export type AbandonedRow = {
  cartKey: string;
  who: string | null;
  lines: number;
  units: number;
  valueFils: number;
  lastTouchedAt: Date;
};

export type CustomerReport = {
  months: MonthSales[];
  accounts: AccountRow[];
  categories: CategoryRow[];
  saved: SavedRow[];
  abandoned: AbandonedRow[];
  totals: { orders: number; revenueFils: number };
};

export async function customerReport(): Promise<CustomerReport> {
  await requireAdmin();

  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - MONTHS);

  const orders = await db.order.findMany({
    where: { placedAt: { gte: since }, status: { not: "Cancelled" } },
    select: {
      placedAt: true,
      subtotalFils: true,
      organisationId: true,
      organisation: { select: { name: true } },
      items: {
        select: {
          qty: true,
          lineTotalFils: true,
          sku: {
            select: {
              product: {
                select: { categories: { select: { category: { select: { name: true } } } } },
              },
            },
          },
        },
      },
    },
  });

  /* --- by month --- */
  const buckets: MonthBucket<(typeof orders)[number]>[] = bucketByMonth(
    orders,
    (order) => order.placedAt,
    { months: MONTHS }
  );

  const months: MonthSales[] = buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    orders: bucket.items.length,
    // Excluding VAT throughout. VAT is collected, not earned, and a revenue
    // figure that includes it flatters every total on the page.
    revenueFils: bucket.items.reduce((n, o) => n + o.subtotalFils, 0),
  }));

  /* --- by account --- */
  const byAccount = new Map<string, AccountRow>();
  for (const order of orders) {
    if (!order.organisationId) continue;
    const row = byAccount.get(order.organisationId) ?? {
      organisationId: order.organisationId,
      name: order.organisation?.name ?? "Unnamed account",
      orders: 0,
      spendFils: 0,
      averageFils: 0,
      lastOrderAt: null,
    };
    row.orders += 1;
    row.spendFils += order.subtotalFils;
    if (!row.lastOrderAt || order.placedAt > row.lastOrderAt) {
      row.lastOrderAt = order.placedAt;
    }
    byAccount.set(order.organisationId, row);
  }
  for (const row of byAccount.values()) {
    row.averageFils = row.orders === 0 ? 0 : Math.round(row.spendFils / row.orders);
  }

  /* --- by category --- */
  const byCategory = new Map<string, CategoryRow>();
  for (const order of orders) {
    for (const item of order.items) {
      // The deepest category, which is the one people browse by. A line in no
      // category still has to appear or the totals stop adding up.
      const name =
        item.sku?.product.categories.at(-1)?.category.name ?? "Uncategorised";
      const row = byCategory.get(name) ?? { name, units: 0, revenueFils: 0 };
      row.units += item.qty;
      row.revenueFils += item.lineTotalFils;
      byCategory.set(name, row);
    }
  }

  /* --- what people saved but have not bought — BE-27 --- */
  const wishlists = await db.wishlistItem.groupBy({
    by: ["productMasterId"],
    _count: { _all: true },
    orderBy: { _count: { productMasterId: "desc" } },
    take: 20,
  });

  const savedProducts = await db.productMaster.findMany({
    where: { id: { in: wishlists.map((w) => w.productMasterId) } },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      skus: { where: { isActive: true }, select: { id: true }, take: 1 },
    },
  });

  const saved: SavedRow[] = wishlists
    .map((row) => {
      const product = savedProducts.find((p) => p.id === row.productMasterId);
      if (!product) return null;
      return {
        productId: product.id,
        name: product.name,
        slug: product.slug,
        savedBy: row._count._all,
        listed: product.status === "Active" && product.skus.length > 0,
      };
    })
    .filter((row): row is SavedRow => row !== null);

  /* --- carts left behind — BE-27 --- */
  const carts = await db.cart.findMany({
    where: { items: { some: {} } },
    select: {
      cartKey: true,
      updatedAt: true,
      user: { select: { name: true, email: true } },
      items: {
        select: { qty: true, sku: { select: { priceFils: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const abandoned: AbandonedRow[] = carts
    .filter((cart) => isAbandoned(cart.updatedAt))
    .map((cart) => ({
      cartKey: cart.cartKey,
      who: cart.user ? `${cart.user.name} · ${cart.user.email}` : null,
      lines: cart.items.length,
      units: cart.items.reduce((n, i) => n + i.qty, 0),
      // At today's prices: the cart holds no snapshot, and this is an
      // indication of what is sitting there rather than an invoice.
      valueFils: cart.items.reduce(
        (n, i) => n + i.qty * (i.sku?.priceFils ?? 0),
        0
      ),
      lastTouchedAt: cart.updatedAt,
    }));

  return {
    months,
    accounts: [...byAccount.values()],
    categories: [...byCategory.values()],
    saved,
    abandoned,
    totals: {
      orders: orders.length,
      revenueFils: orders.reduce((n, o) => n + o.subtotalFils, 0),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Suppliers
 * ------------------------------------------------------------------ */

export type SupplierRow = {
  id: string;
  name: string;
  status: string;
  available: boolean;
  /** Packs they are set up to supply, and how many they cannot supply now. */
  supplies: number;
  unavailable: number;
  purchaseOrders: number;
  /** Null when any order in the window has an uncosted line. */
  spendFils: number | null;
  ordersWithUnknownCost: number;
  /** How quickly they acknowledge, from the status log. */
  acknowledgement: Summary;
  /** Against their agreed window, or null when nothing was agreed — BE-33. */
  onTimePercent: number | null;
  promisedAckHours: number | null;
  promisedLeadTimeDays: number | null;
  /** Lines that fell to them because the first choice could not supply. */
  fallbackLines: number;
};

export type SupplierReport = {
  suppliers: SupplierRow[];
  months: { key: string; label: string; orders: number; spendFils: number }[];
  totals: { purchaseOrders: number; spendFils: number; unknownCostOrders: number };
};

export async function supplierReport(): Promise<SupplierReport> {
  await requireAdmin();

  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - MONTHS);

  const suppliers = await db.supplier.findMany({
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      status: true,
      isAvailable: true,
      ackSlaHours: true,
      promisedLeadTimeDays: true,
      supplies: { select: { isAvailable: true } },
      purchaseOrders: {
        where: { createdAt: { gte: since }, status: { not: "Cancelled" } },
        select: {
          id: true,
          createdAt: true,
          totalCostFils: true,
          lines: { select: { wasFallback: true } },
        },
      },
    },
  });

  // One query for every purchase order's history rather than one per order.
  const allOrderIds = suppliers.flatMap((s) => s.purchaseOrders.map((po) => po.id));
  const histories = await historiesOf("PurchaseOrder", allOrderIds);

  const rows: SupplierRow[] = suppliers.map((supplier) => {
    const ackDurations: number[] = [];
    for (const po of supplier.purchaseOrders) {
      const ms = timeBetween(histories.get(po.id) ?? [], "Sent", "Acknowledged");
      if (ms !== null) ackDurations.push(ms);
    }

    const unknown = supplier.purchaseOrders.filter(
      (po) => po.totalCostFils === null
    ).length;

    return {
      id: supplier.id,
      name: supplier.companyName,
      status: supplier.status,
      available: supplier.isAvailable,
      supplies: supplier.supplies.length,
      unavailable: supplier.supplies.filter((s) => !s.isAvailable).length,
      purchaseOrders: supplier.purchaseOrders.length,
      // Only the orders whose cost is known, with the rest counted separately
      // rather than treated as free.
      spendFils:
        supplier.purchaseOrders.length === unknown
          ? null
          : supplier.purchaseOrders.reduce(
              (n, po) => n + (po.totalCostFils ?? 0),
              0
            ),
      ordersWithUnknownCost: unknown,
      acknowledgement: summarise(ackDurations),
      onTimePercent: onTimeRate(
        ackDurations,
        supplier.ackSlaHours ? supplier.ackSlaHours * 3_600_000 : null
      ).rate,
      promisedAckHours: supplier.ackSlaHours,
      promisedLeadTimeDays: supplier.promisedLeadTimeDays,
      fallbackLines: supplier.purchaseOrders.reduce(
        (n, po) => n + po.lines.filter((l) => l.wasFallback).length,
        0
      ),
    };
  });

  const everyOrder = suppliers.flatMap((s) => s.purchaseOrders);
  const buckets = bucketByMonth(everyOrder, (po) => po.createdAt, {
    months: MONTHS,
  });

  return {
    suppliers: rows,
    months: buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      orders: bucket.items.length,
      spendFils: bucket.items.reduce((n, po) => n + (po.totalCostFils ?? 0), 0),
    })),
    totals: {
      purchaseOrders: everyOrder.length,
      spendFils: everyOrder.reduce((n, po) => n + (po.totalCostFils ?? 0), 0),
      unknownCostOrders: everyOrder.filter((po) => po.totalCostFils === null).length,
    },
  };
}
