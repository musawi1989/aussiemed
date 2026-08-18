import "server-only";

import { db } from "./db";
import { accountSession } from "./account";
import { bucketByMonth } from "./reporting";
import type { Period } from "./periods";

/**
 * What a buyer has spent, and on what.
 *
 * Scoped by the session like everything else in the account: no function here
 * takes an organisation id, so one clinic cannot read another's spending by
 * changing a value in a URL.
 *
 * Every figure excludes VAT unless it says otherwise. VAT is not the
 * customer's cost in any meaningful sense — a registered business reclaims it
 * — so a spending report that quietly includes it overstates what they have
 * actually spent with us.
 */

export type MonthSpend = {
  key: string;
  label: string;
  orders: number;
  netFils: number;
};

export type NamedSpend = {
  name: string;
  orders: number;
  netFils: number;
  units?: number;
};

export type InvoiceRow = {
  reference: string;
  placedAt: Date;
  lines: number;
  netFils: number;
  vatFils: number;
  totalFils: number;
  status: string;
  paymentStatus: string;
  branch: string | null;
  placedBy: string | null;
  poReference: string | null;
};

export type AccountReport = {
  months: MonthSpend[];
  categories: NamedSpend[];
  branches: NamedSpend[];
  people: NamedSpend[];
  invoices: InvoiceRow[];
  totals: {
    orders: number;
    netFils: number;
    vatFils: number;
    totalFils: number;
    averageFils: number;
    units: number;
  };
  /** The earliest order on the account, so "everything" means something. */
  firstOrderAt: Date | null;
};

export async function accountReport(
  period: Period,
  branchId?: string
): Promise<AccountReport | null> {
  const session = await accountSession();
  if (!session) return null;

  const orders = await db.order.findMany({
    where: {
      organisationId: session.organisationId,
      status: { not: "Cancelled" },
      ...(branchId ? { addressId: branchId } : {}),
      placedAt: {
        ...(period.from ? { gte: period.from } : {}),
        lt: period.to,
      },
    },
    orderBy: { placedAt: "desc" },
    select: {
      reference: true,
      placedAt: true,
      status: true,
      paymentStatus: true,
      poReference: true,
      subtotalFils: true,
      vatFils: true,
      totalFils: true,
      placedByName: true,
      staff: { select: { name: true } },
      address: { select: { label: true, city: true } },
      items: {
        select: {
          qty: true,
          lineTotalFils: true,
          sku: {
            select: {
              product: {
                select: {
                  categories: { select: { category: { select: { name: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  const first = await db.order.findFirst({
    where: { organisationId: session.organisationId, status: { not: "Cancelled" } },
    orderBy: { placedAt: "asc" },
    select: { placedAt: true },
  });

  /* --- by month --- */
  const buckets = bucketByMonth(orders, (o) => o.placedAt, {
    months: period.months,
    // The chart ends where the period does, not at today, or a range from
    // last year would draw twelve empty months up to the present.
    now: new Date(period.to.getTime() - 1),
  });

  const months: MonthSpend[] = buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    orders: bucket.items.length,
    netFils: bucket.items.reduce((n, o) => n + o.subtotalFils, 0),
  }));

  /* --- by category, branch and person --- */
  const categories = new Map<string, NamedSpend>();
  const branches = new Map<string, NamedSpend>();
  const people = new Map<string, NamedSpend>();

  const add = (
    map: Map<string, NamedSpend>,
    name: string,
    netFils: number,
    units: number,
    countsAsOrder: boolean
  ) => {
    const row = map.get(name) ?? { name, orders: 0, netFils: 0, units: 0 };
    row.netFils += netFils;
    row.units = (row.units ?? 0) + units;
    if (countsAsOrder) row.orders += 1;
    map.set(name, row);
  };

  for (const order of orders) {
    for (const item of order.items) {
      // The deepest category is the one a buyer recognises: "Gloves", not
      // "Medical Consumables".
      const name =
        item.sku?.product.categories.at(-1)?.category.name ?? "Uncategorised";
      add(categories, name, item.lineTotalFils, item.qty, false);
    }

    const units = order.items.reduce((n, i) => n + i.qty, 0);
    add(
      branches,
      order.address?.label ?? order.address?.city ?? "No branch recorded",
      order.subtotalFils,
      units,
      true
    );
    add(
      people,
      order.staff?.name ?? order.placedByName ?? "Not recorded",
      order.subtotalFils,
      units,
      true
    );
  }

  const invoices: InvoiceRow[] = orders.map((order) => ({
    reference: order.reference,
    placedAt: order.placedAt,
    lines: order.items.length,
    netFils: order.subtotalFils,
    vatFils: order.vatFils,
    totalFils: order.totalFils,
    status: order.status,
    paymentStatus: order.paymentStatus,
    branch: order.address?.label ?? order.address?.city ?? null,
    placedBy: order.staff?.name ?? order.placedByName ?? null,
    poReference: order.poReference,
  }));

  const netFils = orders.reduce((n, o) => n + o.subtotalFils, 0);

  return {
    months,
    categories: [...categories.values()],
    branches: [...branches.values()],
    people: [...people.values()],
    invoices,
    totals: {
      orders: orders.length,
      netFils,
      vatFils: orders.reduce((n, o) => n + o.vatFils, 0),
      totalFils: orders.reduce((n, o) => n + o.totalFils, 0),
      averageFils: orders.length === 0 ? 0 : Math.round(netFils / orders.length),
      units: orders.reduce(
        (n, o) => n + o.items.reduce((m, i) => m + i.qty, 0),
        0
      ),
    },
    firstOrderAt: first?.placedAt ?? null,
  };
}

/**
 * One order, for the customer's own invoice.
 *
 * Scoped by session, so a reference belonging to another account simply does
 * not resolve. Nothing about a supplier or a cost is selected — a customer's
 * invoice has never carried either, and the way to keep it that way is not to
 * read them.
 */
export async function invoiceForAccount(reference: string) {
  const session = await accountSession();
  if (!session) return null;

  return db.order.findFirst({
    where: { reference, organisationId: session.organisationId },
    select: {
      reference: true,
      placedAt: true,
      status: true,
      paymentStatus: true,
      paymentDueOn: true,
      // What has actually come in, so the invoice can show a balance rather
      // than only a total. On credit terms a part payment is normal, and a
      // document that shows the full total next to the word "Part paid"
      // leaves the reader to do the subtraction we already know the answer to.
      paidFils: true,
      poReference: true,
      deliveryType: true,
      courier: true,
      trackingNumber: true,
      subtotalFils: true,
      vatFils: true,
      totalFils: true,
      vatRateBasisPoints: true,
      shippingSnapshot: true,
      placedByName: true,
      staff: { select: { name: true } },
      address: { select: { label: true, city: true } },
      organisation: { select: { name: true, trn: true } },
      items: {
        orderBy: { nameSnapshot: "asc" },
        select: {
          nameSnapshot: true,
          skuCodeSnapshot: true,
          unitLabelSnapshot: true,
          taxClassSnapshot: true,
          qty: true,
          unitPriceFils: true,
          vatFils: true,
          lineTotalFils: true,
        },
      },
    },
  });
}

export type AccountInvoice = NonNullable<Awaited<ReturnType<typeof invoiceForAccount>>>;

