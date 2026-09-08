import "server-only";

import { db } from "./db";
import { requireAdmin } from "./admin";
import { contains } from "./db-search";

/**
 * One box that finds anything in the back office.
 *
 * The admin has thirty-odd screens and each one searches its own rows, which
 * is fine once you know that an order lives under Orders and a part number
 * lives under Products. Somebody learning the job does not know that yet, and
 * a reference number in their hand is not a hint about which menu to open. So
 * this asks the question the other way round: here is a string, what is it?
 *
 * DELIBERATELY NOT A RANKED SEARCH ENGINE. It looks for the things people
 * actually arrive holding — a reference, a SKU, a company name, an email — and
 * groups what it finds by what it is. A fuzzy relevance score across four
 * tables would be harder to trust and no faster to use.
 *
 * ADMIN ONLY, and it must stay that way: it reaches customer names, supplier
 * part numbers and order references in one call. The guard is at the top of
 * the one exported function, and there is no unguarded variant to reach for.
 */

export type SearchHit = {
  /** What kind of thing this is, for the group heading. */
  kind: "Order" | "Product" | "Customer" | "Supplier" | "Purchase order";
  /** The line a person recognises — a reference, a name. */
  title: string;
  /** Everything else worth knowing at a glance. */
  detail: string;
  href: string;
};

/** Per kind, so one match-everything term cannot bury the other groups. */
const PER_KIND = 6;

export async function searchAdmin(term: string): Promise<SearchHit[]> {
  await requireAdmin("orders", "view");

  const q = term.trim();
  // Two characters finds nothing useful and scans every table to do it.
  if (q.length < 2) return [];

  const like = contains(q);

  const [orders, products, customers, suppliers, purchaseOrders] =
    await Promise.all([
      db.order.findMany({
        where: {
          OR: [
            { reference: like },
            { poReference: like },
            { trackingNumber: like },
            { organisation: { name: like } },
            { user: { name: like } },
            { user: { email: like } },
            // How the warehouse finds the order a particular line is on.
            { items: { some: { skuCodeSnapshot: like } } },
          ],
        },
        orderBy: { placedAt: "desc" },
        take: PER_KIND,
        select: {
          reference: true,
          status: true,
          totalFils: true,
          placedAt: true,
          organisation: { select: { name: true } },
        },
      }),

      db.productMaster.findMany({
        where: {
          OR: [
            { name: like },
            { slug: like },
            { skus: { some: { skuCode: like } } },
            { skus: { some: { barcode: like } } },
            // Their code, not ours — the number on a supplier's own invoice.
            { skus: { some: { supplies: { some: { supplierPartNumber: like } } } } },
          ],
        },
        orderBy: { name: "asc" },
        take: PER_KIND,
        select: {
          id: true,
          name: true,
          status: true,
          skus: { take: 1, select: { skuCode: true } },
        },
      }),

      db.organisation.findMany({
        where: {
          OR: [{ name: like }, { trn: like }, { users: { some: { email: like } } }],
        },
        orderBy: { name: "asc" },
        take: PER_KIND,
        select: { id: true, name: true, emirate: true, _count: { select: { orders: true } } },
      }),

      db.supplier.findMany({
        // Both addresses: orders go to the first and accounts mail to the
        // second, and somebody searching a supplier by email has whichever of
        // the two happened to be on the message in front of them.
        where: {
          OR: [
            { companyName: like },
            { primaryEmail: like },
            { secondaryEmail: like },
            { trn: like },
          ],
        },
        orderBy: { companyName: "asc" },
        take: PER_KIND,
        select: { id: true, companyName: true, status: true },
      }),

      db.purchaseOrder.findMany({
        where: { OR: [{ poNumber: like }, { trackingNumber: like }] },
        orderBy: { createdAt: "desc" },
        take: PER_KIND,
        select: {
          poNumber: true,
          status: true,
          supplier: { select: { companyName: true } },
        },
      }),
    ]);

  const aed = (fils: number) => `AED ${(fils / 100).toFixed(2)}`;
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "not placed");

  return [
    ...orders.map((o): SearchHit => ({
      kind: "Order",
      title: o.reference,
      detail: [o.organisation?.name, o.status, aed(o.totalFils), day(o.placedAt)]
        .filter(Boolean)
        .join(" · "),
      href: `/admin/orders/${o.reference}`,
    })),
    ...products.map((p): SearchHit => ({
      kind: "Product",
      title: p.name,
      detail: [p.skus[0]?.skuCode, p.status].filter(Boolean).join(" · "),
      href: `/admin/products/${p.id}`,
    })),
    ...customers.map((c): SearchHit => ({
      kind: "Customer",
      title: c.name,
      detail: [c.emirate, `${c._count.orders} order${c._count.orders === 1 ? "" : "s"}`]
        .filter(Boolean)
        .join(" · "),
      href: `/admin/customers/${c.id}`,
    })),
    ...suppliers.map((s): SearchHit => ({
      kind: "Supplier",
      title: s.companyName,
      detail: s.status,
      href: `/admin/suppliers/${s.id}`,
    })),
    ...purchaseOrders.map((p): SearchHit => ({
      kind: "Purchase order",
      title: p.poNumber,
      detail: [p.supplier.companyName, p.status].filter(Boolean).join(" · "),
      href: `/admin/purchasing/${p.poNumber}`,
    })),
  ];
}
