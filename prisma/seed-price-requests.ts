/**
 * A demo buyer's history of asking us to price things.
 *
 * The Price requests screen is only worth showing if there is something on it,
 * and both kinds of request need to be there: a QUOTE, which names products
 * and comes back with a price per line, and a BULK ENQUIRY, which is a
 * sentence and comes back as an answer in words.
 *
 * Four records, covering the three states a buyer meets:
 *
 *   answered quote     every line priced, with a total
 *   quote in progress  sent, nothing priced yet
 *   answered enquiry   a reply they can read months later
 *   enquiry waiting    sent yesterday, still with us
 *
 * The prices are invented, like everything else in the demo catalogue, and
 * sit below list so the discount is visible without being absurd.
 *
 * SAFE TO RE-RUN. It removes this account's requests and rebuilds them.
 *
 * Run with: npm run db:seed:price-requests
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const BUYER_EMAIL = "musawi1989@gmail.com";

const NOW = new Date();
const daysAgo = (n: number) => {
  const d = new Date(NOW.getTime() - n * 86_400_000);
  d.setHours(9, 15, 0, 0);
  return d;
};

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: BUYER_EMAIL },
    select: { id: true, name: true, email: true, organisation: { select: { name: true } } },
  });
  if (!user) {
    console.log(`No account for ${BUYER_EMAIL}.`);
    return;
  }

  await prisma.quoteRequest.deleteMany({ where: { userId: user.id } });
  await prisma.enquiry.deleteMany({ where: { userId: user.id } });

  /* ---- what to quote on ---------------------------------------------- */

  // Real, live, price-broken packs. A quote against a withdrawn product would
  // be a demo of a bug.
  const skus = await prisma.productSku.findMany({
    where: {
      isActive: true,
      product: { status: "Active" },
      tiers: { some: {} },
    },
    take: 4,
    select: { id: true, priceFils: true, skuCode: true },
  });

  if (skus.length < 3) {
    console.log("Not enough live priced packs to build a quote against.");
    return;
  }

  /** A quoted price sits below list — that is the whole point of asking. */
  const discounted = (fils: number, percent: number) =>
    Math.round((fils * (100 - percent)) / 100);

  /* ---- 1. a quote that came back priced ------------------------------ */

  const answered = await prisma.quoteRequest.create({
    data: {
      userId: user.id,
      reference: "AM-Q-2026-0041",
      contactName: user.name,
      contactEmail: user.email,
      notes: "Standing monthly order for the Deira clinic. Can you hold these for a quarter?",
      status: "Quoted",
      createdAt: daysAgo(26),
      updatedAt: daysAgo(24),
      items: {
        create: [
          { skuId: skus[0].id, qty: 40, quotedPriceFils: discounted(skus[0].priceFils, 12) },
          { skuId: skus[1].id, qty: 25, quotedPriceFils: discounted(skus[1].priceFils, 8) },
          { skuId: skus[2].id, qty: 10, quotedPriceFils: discounted(skus[2].priceFils, 15) },
        ],
      },
    },
    select: { reference: true, items: { select: { quotedPriceFils: true, qty: true } } },
  });

  const total = answered.items.reduce(
    (n, i) => n + (i.quotedPriceFils ?? 0) * i.qty,
    0
  );
  console.log(
    `  ${answered.reference}  quoted   ${answered.items.length} lines, AED ${(total / 100).toFixed(2)}`
  );

  /* ---- 2. a quote still being priced --------------------------------- */

  const pendingQuote = await prisma.quoteRequest.create({
    data: {
      userId: user.id,
      reference: "AM-Q-2026-0058",
      contactName: user.name,
      contactEmail: user.email,
      notes: "Same again plus the pipettes — what can you do on the larger quantity?",
      status: "New",
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
      items: {
        create: [
          { skuId: skus[1].id, qty: 60 },
          { skuId: skus[3]?.id ?? skus[2].id, qty: 15 },
        ],
      },
    },
    select: { reference: true, items: { select: { id: true } } },
  });
  console.log(
    `  ${pendingQuote.reference}  with us  ${pendingQuote.items.length} lines, not yet priced`
  );

  /* ---- 3. a bulk enquiry that was answered --------------------------- */

  await prisma.enquiry.create({
    data: {
      userId: user.id,
      kind: "BulkBuy",
      company: user.organisation?.name ?? null,
      contactName: user.name,
      email: user.email,
      phone: "04 555 0999",
      message:
        "We get through roughly 40 boxes of nitrile gloves a month across three sites. What would that cost on a standing order, and can you hold the price?",
      status: "Answered",
      replyToCustomer:
        "At 40 boxes a month we can do AED 25.05 a box against a standing order, held for 90 days from today. " +
        "That is 12% below list and includes delivery to all three branches on the usual next-run terms.\n\n" +
        "If the volume goes above 60 a month we can look at it again.",
      answeredByName: "AussieMed Admin",
      answeredAt: daysAgo(17),
      createdAt: daysAgo(19),
      internalNotes: "Margin holds at 12% off. Livingstone cover, backup priced 4% higher.",
    },
  });
  console.log("  bulk enquiry  answered  gloves, 40/month, held 90 days");

  /* ---- 4. a bulk enquiry still with us ------------------------------- */

  await prisma.enquiry.create({
    data: {
      userId: user.id,
      kind: "BulkBuy",
      company: user.organisation?.name ?? null,
      contactName: user.name,
      email: user.email,
      phone: "04 555 0999",
      message:
        "Adding a fourth site in Sharjah from October. Would the gloves price still stand, and what about the dressing packs?",
      status: "New",
      createdAt: daysAgo(1),
    },
  });
  console.log("  bulk enquiry  with us   fourth site from October");

  console.log("");
  console.log(`4 price requests on ${user.email}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
