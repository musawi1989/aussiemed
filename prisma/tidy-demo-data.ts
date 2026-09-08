/**
 * Clearing out what the catalogue prune left behind.
 *
 * Taking 2,010 products off sale (CHG-12) did not touch anything that already
 * pointed at them. What is left is orders for things nobody can buy any more,
 * and saved lists full of products that no longer appear anywhere on the site —
 * both of which look like faults rather than history when a client is shown
 * round.
 *
 * THREE JOBS, AND THE SECOND ONE IS DELIBERATELY NARROW:
 *
 *  1. Named orders. A specific list, for orders raised while testing.
 *
 *  2. Orders where EVERY line is a product that is no longer on the site.
 *     Those are test orders against sample data and mean nothing now.
 *     AN ORDER WITH ONE DEAD LINE AMONG LIVE ONES IS LEFT ALONE — it is real
 *     history, somebody was charged for it, and deleting a whole order because
 *     one product was later withdrawn destroys the record of a real trade.
 *     An order with an allocation is never touched either: it is feeding a
 *     purchase order and the supply chain would be broken behind it.
 *
 *  3. Saved products pointing at something no longer on the site, for named
 *     accounts. A "My products" list of things that 404 is worse than empty.
 *
 * NOT REVERSIBLE. Orders are deleted, not deactivated — the whole point is
 * that these ones are noise. The register's usual rule (retire, never delete)
 * protects real trading history, and none of this is any.
 *
 * Run with: npm run db:tidy
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

/** Orders to remove by name, whatever they contain. */
const NAMED_ORDERS = ["AM-2026-000022"];

/** Accounts whose saved lists should be pruned of withdrawn products. */
const TIDY_SAVED_FOR = ["musawi1989@gmail.com"];

/**
 * Suppliers whose lists should be pruned the same way.
 *
 * A supplier's list is what they have told us they can send. A row pointing at
 * a product that is not on the site is a line nobody can order and one more
 * thing for them to scroll past.
 */
const TIDY_SUPPLIES_FOR = ["AussieMed Distribution", "Chemist Warehouse"];

async function main() {
  /* ---- 1. the named ones -------------------------------------------- */

  for (const reference of NAMED_ORDERS) {
    const order = await prisma.order.findUnique({
      where: { reference },
      select: {
        id: true,
        status: true,
        items: { select: { id: true, allocations: { select: { id: true } } } },
      },
    });

    if (!order) {
      console.log(`  ${reference} — not found, nothing to do`);
      continue;
    }

    const allocated = order.items.some((i) => i.allocations.length > 0);
    if (allocated) {
      // Refused rather than cascaded. An allocated line is the link between a
      // customer order and the purchase order that bought for it; removing it
      // silently would leave a purchase order buying for nobody.
      console.log(
        `  ${reference} — REFUSED: it has purchase-order allocations. Unpick those first.`
      );
      continue;
    }

    await prisma.order.delete({ where: { id: order.id } });
    console.log(`  ${reference} — removed (${order.items.length} line(s))`);
  }

  /* ---- 2. orders that are entirely withdrawn products ---------------- */

  const orders = await prisma.order.findMany({
    select: {
      id: true,
      reference: true,
      status: true,
      items: {
        select: {
          id: true,
          allocations: { select: { id: true } },
          sku: { select: { product: { select: { status: true } } } },
        },
      },
    },
  });

  const doomed = orders.filter((order) => {
    if (order.items.length === 0) return false;
    if (order.items.some((i) => i.allocations.length > 0)) return false;
    // Every line must be gone. One live line makes it a real order.
    return order.items.every(
      (i) => !i.sku?.product || i.sku.product.status !== "Active"
    );
  });

  console.log("");
  if (doomed.length === 0) {
    console.log("No order is made up entirely of withdrawn products.");
  } else {
    for (const order of doomed) {
      console.log(
        `  ${order.reference} — removed (${order.items.length} line(s), all withdrawn, ${order.status})`
      );
    }
    await prisma.order.deleteMany({ where: { id: { in: doomed.map((o) => o.id) } } });
  }

  // Said out loud, because "why is that one still here" is the next question.
  const kept = orders.filter(
    (order) =>
      !doomed.includes(order) &&
      order.items.some((i) => !i.sku?.product || i.sku.product.status !== "Active")
  );
  if (kept.length > 0) {
    console.log("");
    console.log(`Kept ${kept.length} order(s) that have a withdrawn line but also real ones:`);
    for (const order of kept) {
      const dead = order.items.filter(
        (i) => !i.sku?.product || i.sku.product.status !== "Active"
      ).length;
      const why = order.items.some((i) => i.allocations.length > 0)
        ? "allocated to a purchase order"
        : "still has live lines";
      console.log(`  ${order.reference} — ${dead}/${order.items.length} withdrawn, ${why}`);
    }
  }

  /* ---- 3. saved products that no longer exist ------------------------ */

  console.log("");
  for (const email of TIDY_SAVED_FOR) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true },
    });
    if (!user) {
      console.log(`  ${email} — no such account`);
      continue;
    }

    const saved = await prisma.wishlistItem.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        product: { select: { name: true, status: true, slug: true } },
      },
    });

    const gone = saved.filter((s) => s.product.status !== "Active");

    if (gone.length === 0) {
      console.log(`  ${email} — every saved product is still on the site`);
      continue;
    }

    await prisma.wishlistItem.deleteMany({
      where: { id: { in: gone.map((g) => g.id) } },
    });

    // Sample filler and a real product withdrawn for want of a photograph are
    // both "not on the site", but only one of them might come back.
    const samples = gone.filter((g) => g.product.slug.startsWith("sample-")).length;
    console.log(
      `  ${email} — removed ${gone.length} saved product(s): ` +
        `${samples} sample, ${gone.length - samples} real but withdrawn. ` +
        `${saved.length - gone.length} left.`
    );
    for (const g of gone.filter((x) => !x.product.slug.startsWith("sample-"))) {
      console.log(`      was: ${g.product.name}`);
    }
  }

  /* ---- 4. supply rows for products nobody can buy -------------------- */

  console.log("");
  for (const companyName of TIDY_SUPPLIES_FOR) {
    const supplier = await prisma.supplier.findFirst({
      where: { companyName },
      select: { id: true, companyName: true },
    });
    if (!supplier) {
      console.log(`  ${companyName} — no such supplier`);
      continue;
    }

    const rows = await prisma.productSupply.findMany({
      where: { supplierId: supplier.id },
      select: {
        id: true,
        rank: true,
        sku: {
          select: {
            skuCode: true,
            isActive: true,
            product: { select: { status: true, slug: true } },
          },
        },
      },
    });

    /*
     * "On the website" is BOTH, and the pack half is easy to miss.
     *
     * A product can be on sale while one of its packs is not — the box of 10
     * withdrawn, the single kept. The supplier portal already draws this line
     * (supplier-portal.ts calls it `listed`), so a row failing it is a row the
     * supplier sees marked as unavailable and can do nothing about.
     * Checking only the product leaves exactly those behind.
     */
    const listed = (r: (typeof rows)[number]) =>
      r.sku.isActive && r.sku.product.status === "Active";

    const gone = rows.filter((r) => !listed(r));

    if (gone.length === 0) {
      console.log(`  ${companyName} — every item they supply is still listed`);
      continue;
    }

    await prisma.productSupply.deleteMany({
      where: { id: { in: gone.map((g) => g.id) } },
    });

    /*
     * Cover is counted separately from offers, and said out loud.
     *
     * An offer is the supplier's own note that they could supply something.
     * A rank is cover WE agreed and the buying run depends on — deleting it is
     * a bigger act, even when the product behind it is off sale, because if
     * that product comes back the cover does not.
     */
    const cover = gone.filter((g) => g.rank !== null).length;
    const left = rows.length - gone.length;
    const liveCover = rows.filter((r) => r.rank !== null && listed(r)).length;

    console.log(
      `  ${companyName} — removed ${gone.length} (${cover} cover, ${gone.length - cover} offers). ` +
        `${left} left, ${liveCover} of them cover on a listed product.`
    );

    if (liveCover === 0) {
      console.log(
        `      ⚠ ${companyName} now covers nothing that is on sale. Nothing will be ordered from them.`
      );
    }
  }

  const remaining = await prisma.order.count();
  console.log(`\n${remaining} order(s) remain.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
