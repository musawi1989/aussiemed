/**
 * A small, deliberate set of purchase orders for showing a client.
 *
 * The database had nine, spread across four suppliers, in eight different
 * states — including two suppliers with no login, whose orders can therefore
 * never appear in the portal being demonstrated. That is a lot of noise to
 * walk somebody through and no clearer for it.
 *
 * This replaces them with five, on the two suppliers that can actually sign in,
 * chosen so that every state a supplier meets appears exactly once:
 *
 *   Sent               they have it and have not answered yet
 *   Acknowledged       they have confirmed they can supply
 *   Dispatched         on its way, with a courier and a tracking number
 *   PartiallyReceived  some of it arrived — the backorder story
 *   Received           closed, with batch codes against the goods
 *
 * NO DRAFT. A draft is ours until sent and shows on Needs attention as
 * something nobody has done, which is not what anyone wants on screen during a
 * demonstration. The buying run creates one at the cutoff if you want to show
 * that part.
 *
 * ⚠ IT KEEPS THE CUSTOMER ORDERS COHERENT. Deleting purchase orders takes
 * their allocations with them, and an allocation is what tells an order which
 * supplier its goods came from, which batch, and what they cost. Five customer
 * orders — three of them already Delivered or Dispatched — would have been left
 * saying "not yet purchased" on every line, with no traceable batch and no
 * realised margin. So the same order lines are allocated again, to a purchase
 * order whose state matches theirs: a delivered order traces to a received
 * purchase order, not to one still sitting with the supplier.
 *
 * SAFE TO RE-RUN. It deletes every purchase order and builds these five.
 *
 * Run with: npm run db:seed:purchase-orders
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

/** Fixed clock. A demo that reads "sent 0 days ago" every time it is rebuilt
 *  cannot show ageing, which is half of what the screen is for. */
const NOW = new Date();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

/** The two suppliers with a login. Anything else cannot be demonstrated. */
const DEMO_SUPPLIERS = ["AussieMed Distribution", "Chemist Warehouse"] as const;

type PlannedOrder = {
  poNumber: string;
  supplier: (typeof DEMO_SUPPLIERS)[number];
  status: string;
  sentDaysAgo: number | null;
  acknowledgedDaysAgo: number | null;
  dispatchedDaysAgo: number | null;
  receivedDaysAgo: number | null;
  expectedInDays: number | null;
  courier: string | null;
  trackingNumber: string | null;
  /** Which customer-order states this order supplies. */
  serves: string[];
  /** Received against ordered, as a fraction, for the receipt story. */
  receivedFraction: number;
  batchPrefix: string | null;
  supplierNotes: string | null;
};

/**
 * ONE ORDER PER SUPPLIER PER MONTH — the client's model from 28 Aug 2026.
 *
 * So the demo runs over two months rather than five orders in one: last
 * month's order, closed and paid, and this month's, still open and growing.
 * That is the shape a supplier actually sees, and showing three August orders
 * for one supplier would demonstrate a rule the system no longer follows.
 *
 * Numbers follow the monthly scheme: PO-YYYY-MM-NNN.
 */
const PLAN: PlannedOrder[] = [
  // --- last month, finished ---
  {
    poNumber: "PO-2026-07-001",
    supplier: "AussieMed Distribution",
    status: "Received",
    sentDaysAgo: 45,
    acknowledgedDaysAgo: 44,
    dispatchedDaysAgo: 40,
    receivedDaysAgo: 36,
    expectedInDays: null,
    courier: "Aramex",
    trackingNumber: "ARX4380117AE",
    serves: ["Delivered"],
    receivedFraction: 1,
    batchPrefix: "LOT-24",
    supplierNotes: null,
  },
  {
    poNumber: "PO-2026-07-002",
    supplier: "Chemist Warehouse",
    status: "PartiallyReceived",
    sentDaysAgo: 41,
    acknowledgedDaysAgo: 40,
    dispatchedDaysAgo: 38,
    receivedDaysAgo: 34,
    expectedInDays: null,
    courier: "Emirates Post",
    trackingNumber: "EP99213004AE",
    serves: ["Dispatched"],
    receivedFraction: 0.5,
    batchPrefix: "LOT-25",
    supplierNotes: "Short on the syringes — the balance follows next week.",
  },

  // --- this month, still open and growing ---
  {
    poNumber: "PO-2026-08-001",
    supplier: "AussieMed Distribution",
    status: "Acknowledged",
    sentDaysAgo: 12,
    acknowledgedDaysAgo: 11,
    dispatchedDaysAgo: null,
    receivedDaysAgo: null,
    expectedInDays: 2,
    courier: null,
    trackingNumber: null,
    serves: ["Processing", "Dispatched"],
    receivedFraction: 0,
    batchPrefix: null,
    supplierNotes: "Confirmed. Anything added before the 28th ships with it.",
  },
  {
    poNumber: "PO-2026-08-002",
    supplier: "Chemist Warehouse",
    status: "Sent",
    sentDaysAgo: 9,
    acknowledgedDaysAgo: null,
    dispatchedDaysAgo: null,
    receivedDaysAgo: null,
    expectedInDays: 4,
    courier: null,
    trackingNumber: null,
    serves: ["Processing"],
    receivedFraction: 0,
    batchPrefix: null,
    supplierNotes: null,
  },
];

async function main() {
  /* ---- who we are building for ------------------------------------- */

  const suppliers = await prisma.supplier.findMany({
    where: { companyName: { in: [...DEMO_SUPPLIERS] } },
    select: { id: true, companyName: true },
  });
  const supplierId = new Map(suppliers.map((s) => [s.companyName, s.id]));

  for (const name of DEMO_SUPPLIERS) {
    if (!supplierId.has(name)) {
      console.log(`SKIPPED  no supplier called "${name}"`);
      return;
    }
  }

  /* ---- the demand these orders answer ------------------------------- */

  /*
   * Order lines that were purchased for, grouped by the state of the customer
   * order they belong to. Taken from the live orders rather than invented, so
   * the admin side of the demo shows a real chain: this customer's line came
   * from that purchase order, at that cost, in that batch.
   */
  const found = await prisma.orderItem.findMany({
    where: {
      order: {
        status: { in: ["Processing", "Dispatched", "Delivered"] },
        // AM-TEST- orders belong to the order-state seed and have their own
        // story; keeping them out stops the two demos colliding.
        NOT: { reference: { startsWith: "AM-TEST-" } },
      },
    },
    select: {
      id: true,
      skuId: true,
      qty: true,
      nameSnapshot: true,
      skuCodeSnapshot: true,
      order: { select: { reference: true, status: true } },
    },
    orderBy: { order: { placedAt: "asc" } },
  });

  /*
   * A line with no skuId cannot be purchased against — it is a snapshot of a
   * product that has since gone. Dropped here rather than in the query: the
   * generated client rejects a null comparison on this column, and one filter
   * in plain JavaScript is clearer than working around that.
   */
  const items = found.filter(
    (item): item is (typeof found)[number] & { skuId: string } =>
      item.skuId !== null
  );

  const byState = new Map<string, typeof items>();
  for (const item of items) {
    const list = byState.get(item.order.status) ?? [];
    list.push(item);
    byState.set(item.order.status, list);
  }

  /* ---- what each pack costs us -------------------------------------- */

  const supplies = await prisma.productSupply.findMany({
    where: { rank: { not: null }, costFils: { not: null } },
    select: { skuId: true, supplierId: true, costFils: true, supplierPartNumber: true },
  });
  const costFor = (skuId: string, supId: string) =>
    supplies.find((s) => s.skuId === skuId && s.supplierId === supId) ??
    supplies.find((s) => s.skuId === skuId) ??
    null;

  /* ---- out with the old --------------------------------------------- */

  // Allocations and lines cascade from the order, so one delete is enough.
  const removed = await prisma.purchaseOrder.deleteMany({});
  console.log(`Removed ${removed.count} purchase order(s) and everything under them.`);

  /* ---- in with the five --------------------------------------------- */

  // Each order takes its lines from the pool for the states it serves, so two
  // orders never allocate the same customer line twice.
  const taken = new Set<string>();
  let built = 0;

  for (const plan of PLAN) {
    const pool = plan.serves
      .flatMap((state) => byState.get(state) ?? [])
      .filter((item) => !taken.has(item.id))
      // Three lines reads as a real order and still fits on a screen.
      .slice(0, 3);

    if (pool.length === 0) {
      console.log(`  ${plan.poNumber}: no unallocated ${plan.serves.join("/")} lines left, skipped`);
      continue;
    }
    pool.forEach((item) => taken.add(item.id));

    const supId = supplierId.get(plan.supplier)!;

    const lines = pool.map((item, index) => {
      const supply = costFor(item.skuId, supId);
      const unitCost = supply?.costFils ?? null;
      const received =
        plan.receivedFraction === 0
          ? 0
          : Math.max(1, Math.round(item.qty * plan.receivedFraction));

      return {
        item,
        unitCost,
        partNumber: supply?.supplierPartNumber ?? null,
        qtyReceived: Math.min(received, item.qty),
        // A batch is recorded when goods actually arrive, not before.
        batchCode:
          plan.batchPrefix && received > 0
            ? `${plan.batchPrefix}${String(index + 1).padStart(2, "0")}`
            : null,
      };
    });

    const totalCost = lines.reduce(
      (n, l) => n + (l.unitCost === null ? 0 : l.unitCost * l.item.qty),
      0
    );

    await prisma.purchaseOrder.create({
      data: {
        poNumber: plan.poNumber,
        supplierId: supId,
        status: plan.status,
        // The month this order belongs to. The build matches on it when it
        // looks for "this supplier's open order for this month", so it has to
        // fall inside the month the number claims.
        cutoffAt: daysAgo(plan.sentDaysAgo ?? 0),
        sentAt: plan.sentDaysAgo === null ? null : daysAgo(plan.sentDaysAgo),
        acknowledgedAt:
          plan.acknowledgedDaysAgo === null ? null : daysAgo(plan.acknowledgedDaysAgo),
        dispatchedAt:
          plan.dispatchedDaysAgo === null ? null : daysAgo(plan.dispatchedDaysAgo),
        receivedAt:
          plan.receivedDaysAgo === null ? null : daysAgo(plan.receivedDaysAgo),
        expectedAt: plan.expectedInDays === null ? null : daysAhead(plan.expectedInDays),
        courier: plan.courier,
        trackingNumber: plan.trackingNumber,
        supplierNotes: plan.supplierNotes,
        totalCostFils: totalCost > 0 ? totalCost : null,
        // Paid once it is in and invoiced; anything still in transit is not.
        paymentStatus: plan.status === "Received" ? "Paid" : "Unpaid",
        paidFils: plan.status === "Received" ? totalCost : 0,
        paidAt: plan.status === "Received" ? daysAgo(10) : null,
        paymentDueOn: plan.sentDaysAgo === null ? null : daysAhead(14),
        lines: {
          create: lines.map((l) => ({
            skuId: l.item.skuId,
            nameSnapshot: l.item.nameSnapshot,
            skuCodeSnapshot: l.item.skuCodeSnapshot,
            supplierPartNumberSnapshot: l.partNumber,
            unitCostFilsSnapshot: l.unitCost,
            qtyOrdered: l.item.qty,
            qtyReceived: l.qtyReceived,
            lineCostFils: l.unitCost === null ? null : l.unitCost * l.item.qty,
            allocations: {
              create: [
                {
                  orderItemId: l.item.id,
                  qty: l.item.qty,
                  batchCode: l.batchCode,
                  // Twelve months out, which is ordinary for consumables and
                  // long enough not to render as an expiry warning.
                  expiresOn: l.batchCode ? daysAhead(365) : null,
                  allocatedBy: "Demo data",
                },
              ],
            },
          })),
        },
      },
    });

    built += 1;
    console.log(
      `  ${plan.poNumber}  ${plan.status.padEnd(18)} ${plan.supplier.padEnd(24)} ${lines.length} line(s)`
    );
  }

  console.log(`\n${built} purchase order(s) built.`);
  console.log(`${taken.size} customer order line(s) still trace to a supplier.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
