/**
 * Test orders covering every state the colour system can show.
 *
 * The local database had seven orders and every one of them was Unpaid with no
 * due date, so three of the five tones never appeared on a screen. You cannot
 * check a colour system against data that only exercises one colour, and you
 * cannot spot that "Overdue" and "Draft" render identically if nothing is ever
 * overdue.
 *
 * So this builds a deliberate spread: a delivered order paid in full, one
 * delivered and badly overdue, a part payment, a cancellation, a dispatch
 * nobody can trace, a split delivery with a line on backorder, and a pick-up
 * waiting at the counter. Between them every tone appears on every axis.
 *
 * SAFE TO RE-RUN. Every order it makes is prefixed AM-TEST-, and it deletes
 * those before rebuilding them. It never touches the AM-2026- orders placed
 * through the site, so real testing done by hand is not swept away.
 *
 * Run with: npm run db:seed:orders
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const PREFIX = "AM-TEST-";
const VAT_BASIS_POINTS = 500;

const DAY = 86_400_000;
const now = Date.now();
/** Dates are relative to the run, so the spread stays meaningful next month. */
const daysAgo = (n: number) => new Date(now - n * DAY);
const daysAhead = (n: number) => new Date(now + n * DAY);

/* ------------------------------------------------------------------ *
 * What each order is for
 * ------------------------------------------------------------------ */

type LineSpec = { qty: number; status: string };

type OrderSpec = {
  /** Suffix after AM-TEST-. Readable, because these are read in a list. */
  ref: string;
  /** Why this order exists, printed when seeding so the spread is auditable. */
  purpose: string;
  status: string;
  paymentStatus: string;
  paidRatio?: number;
  placedDaysAgo: number;
  dueInDays?: number | null;
  deliveryType?: string;
  courier?: string | null;
  trackingNumber?: string | null;
  lines: LineSpec[];
};

const ORDERS: OrderSpec[] = [
  {
    ref: "DELIVERED-PAID",
    purpose: "Finished and settled. Green on all three axes.",
    status: "Delivered",
    paymentStatus: "Paid",
    paidRatio: 1,
    placedDaysAgo: 45,
    dueInDays: -15,
    courier: "Aramex",
    trackingNumber: "ARX778120114",
    lines: [
      { qty: 4, status: "Shipped" },
      { qty: 2, status: "Shipped" },
      { qty: 1, status: "Shipped" },
    ],
  },
  {
    ref: "DELIVERED-OVERDUE",
    purpose:
      "The pairing that matters: goods delivered, money 24 days late. Green " +
      "on delivery, red on payment, on the same row.",
    status: "Delivered",
    paymentStatus: "Unpaid",
    placedDaysAgo: 54,
    dueInDays: -24,
    courier: "Emirates Post",
    trackingNumber: "EP9930041AE",
    lines: [
      { qty: 6, status: "Shipped" },
      { qty: 2, status: "Shipped" },
    ],
  },
  {
    ref: "PART-PAID",
    purpose: "Half the money in, half still owed. Amber on payment.",
    status: "Delivered",
    paymentStatus: "PartiallyPaid",
    paidRatio: 0.5,
    placedDaysAgo: 20,
    dueInDays: 4,
    courier: "Aramex",
    trackingNumber: "ARX778120220",
    lines: [
      { qty: 3, status: "Shipped" },
      { qty: 5, status: "Shipped" },
    ],
  },
  {
    ref: "DUE-SOON",
    purpose: "Falls due inside the week, so the reminder tone shows.",
    status: "Delivered",
    paymentStatus: "Unpaid",
    placedDaysAgo: 26,
    dueInDays: 3,
    courier: "Aramex",
    trackingNumber: "ARX778120301",
    lines: [{ qty: 2, status: "Shipped" }],
  },
  {
    ref: "SPLIT-BACKORDER",
    purpose:
      "Part shipped, one line stuck at a supplier. The case the order-level " +
      "status cannot express on its own.",
    status: "Dispatched",
    paymentStatus: "Unpaid",
    placedDaysAgo: 6,
    dueInDays: 24,
    courier: "Aramex",
    trackingNumber: "ARX778120415",
    lines: [
      { qty: 4, status: "Shipped" },
      { qty: 2, status: "Shipped" },
      { qty: 3, status: "Backordered" },
      { qty: 1, status: "Packed" },
    ],
  },
  {
    ref: "UNTRACKED",
    purpose:
      "Marked dispatched with no courier and no tracking number, so nobody " +
      "can tell the customer where it is. Blue on goods, amber on delivery.",
    status: "Dispatched",
    paymentStatus: "Unpaid",
    placedDaysAgo: 4,
    dueInDays: 26,
    courier: null,
    trackingNumber: null,
    lines: [
      { qty: 2, status: "Shipped" },
      { qty: 1, status: "Shipped" },
    ],
  },
  {
    ref: "PICKUP",
    purpose: "Waiting at the counter to be collected, not on a courier.",
    status: "Dispatched",
    paymentStatus: "Paid",
    paidRatio: 1,
    placedDaysAgo: 2,
    dueInDays: 28,
    deliveryType: "PickUp",
    lines: [{ qty: 1, status: "Packed" }],
  },
  {
    ref: "IN-PICKING",
    purpose: "Mid-flight at the sorting facility, every line at a stage.",
    status: "Processing",
    paymentStatus: "Unpaid",
    placedDaysAgo: 1,
    dueInDays: 29,
    lines: [
      { qty: 5, status: "Packed" },
      { qty: 2, status: "Picked" },
      { qty: 3, status: "Allocated" },
      { qty: 1, status: "Pending" },
    ],
  },
  {
    ref: "JUST-PLACED",
    purpose: "In today, waiting for the 5pm buying run. The floor state.",
    status: "Pending",
    paymentStatus: "Unpaid",
    placedDaysAgo: 0,
    dueInDays: 30,
    lines: [
      { qty: 2, status: "Pending" },
      { qty: 4, status: "Pending" },
    ],
  },
  {
    ref: "CANCELLED",
    purpose: "Stopped after payment, then refunded. Red goods, grey money.",
    status: "Cancelled",
    paymentStatus: "Refunded",
    placedDaysAgo: 12,
    dueInDays: 18,
    lines: [
      { qty: 3, status: "Cancelled" },
      { qty: 1, status: "Cancelled" },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Building them
 * ------------------------------------------------------------------ */

console.log("\nSeeding test orders\n");

const org = await prisma.organisation.findFirst({
  where: { name: { not: "" } },
  select: { id: true, name: true },
});
const user = await prisma.user.findFirst({
  where: { role: "Customer", isDisabled: false },
  select: { id: true, name: true, organisationId: true },
});
const address = await prisma.address.findFirst({
  select: {
    id: true,
    label: true,
    contact: true,
    phone: true,
    line1: true,
    emirate: true,
  },
});

if (!org || !user) {
  console.error(
    "  No customer or organisation found. Run `npm run db:seed:accounts` first."
  );
  process.exit(1);
}

/**
 * Real SKUs, so the lines carry real names, codes and prices.
 *
 * Ordered by code rather than taken at random: the same seed run twice should
 * produce the same orders, or comparing a screen before and after a change
 * tells you nothing.
 */
const skus = await prisma.productSku.findMany({
  orderBy: { skuCode: "asc" },
  take: 24,
  select: {
    id: true,
    skuCode: true,
    unitLabel: true,
    priceFils: true,
    product: { select: { name: true, taxClass: true } },
  },
});

if (skus.length < 6) {
  console.error("  Not enough SKUs to build orders. Run `npm run db:seed`.");
  process.exit(1);
}

// Clear only ours. Orders placed by hand through the site are left alone.
const gone = await prisma.order.deleteMany({
  where: { reference: { startsWith: PREFIX } },
});
if (gone.count > 0) console.log(`  cleared ${gone.count} previous test orders\n`);

let skuCursor = 0;
const nextSku = () => skus[skuCursor++ % skus.length]!;

for (const spec of ORDERS) {
  const reference = PREFIX + spec.ref;
  const placedAt = daysAgo(spec.placedDaysAgo);

  const lines = spec.lines.map((line) => {
    const sku = nextSku();
    const zeroRated = sku.product.taxClass === "ZeroRated";
    const lineTotalFils = sku.priceFils * line.qty;
    // VAT on the net, in fils, rounded once — never a float multiplied out.
    const vatFils = zeroRated
      ? 0
      : Math.round((lineTotalFils * VAT_BASIS_POINTS) / 10_000);

    return {
      skuId: sku.id,
      nameSnapshot: sku.product.name,
      skuCodeSnapshot: sku.skuCode,
      unitLabelSnapshot: sku.unitLabel,
      taxClassSnapshot: zeroRated ? "ZeroRated" : "Standard",
      qty: line.qty,
      unitPriceFils: sku.priceFils,
      lineTotalFils,
      vatFils,
      status: line.status,
    };
  });

  // A cancelled line is not part of what was charged — unless every line is
  // cancelled, in which case the order still has to carry the value it was
  // placed at. An order that was raised for AED 200 and refunded is a record of
  // AED 200 having moved twice, not a record of nothing having happened, and an
  // invoice reading AED 0.00 tells an accounts clerk nothing they can reconcile.
  const live = lines.filter((l) => l.status !== "Cancelled");
  const billable = live.length > 0 ? live : lines;
  const subtotalFils = billable.reduce((n, l) => n + l.lineTotalFils, 0);
  const vatFils = billable.reduce((n, l) => n + l.vatFils, 0);
  const totalFils = subtotalFils + vatFils;

  // Refunded means the money came in and went back out again, so the order
  // shows as fully settled rather than as never paid.
  const paidFils =
    spec.paymentStatus === "Refunded"
      ? totalFils
      : Math.round(totalFils * (spec.paidRatio ?? 0));

  await prisma.order.create({
    data: {
      reference,
      userId: user.id,
      organisationId: user.organisationId ?? org.id,
      addressId: address?.id ?? null,
      // Checkout snapshots the address so a later edit to the address book
      // cannot move where a historical order went. Seeding without it left the
      // "Delivered to" block off every test invoice, which is a whole panel of
      // the document going unexercised.
      shippingSnapshot: address
        ? JSON.stringify({
            company: org.name,
            contact: address.contact,
            email: null,
            phone: address.phone,
            line1: address.line1,
            emirate: address.emirate,
          })
        : null,
      placedByName: user.name,
      placedAt,
      status: spec.status,
      paymentStatus: spec.paymentStatus,
      paidFils,
      paidAt: paidFils > 0 ? daysAgo(Math.max(0, spec.placedDaysAgo - 3)) : null,
      paymentDueOn:
        spec.dueInDays === null || spec.dueInDays === undefined
          ? null
          : daysAhead(spec.dueInDays),
      paymentMethod: "OfflinePurchaseOrder",
      deliveryType: spec.deliveryType ?? "Delivery",
      courier: spec.courier ?? null,
      trackingNumber: spec.trackingNumber ?? null,
      subtotalFils,
      vatFils,
      totalFils,
      vatRateBasisPoints: VAT_BASIS_POINTS,
      internalNotes: `Seeded by db:seed:orders — ${spec.purpose}`,
      items: { create: lines },
    },
  });

  const money = (fils: number) => (fils / 100).toFixed(2);
  console.log(
    `  ${reference.padEnd(26)} ${spec.status.padEnd(11)} ` +
      `${spec.paymentStatus.padEnd(14)} AED ${money(totalFils).padStart(9)}` +
      (paidFils > 0 && paidFils < totalFils
        ? `  (AED ${money(paidFils)} received)`
        : "")
  );
}

console.log(`\n  ${ORDERS.length} test orders written for ${org.name}.`);
console.log("  Every one is prefixed AM-TEST- and can be re-seeded safely.\n");

await prisma.$disconnect();
