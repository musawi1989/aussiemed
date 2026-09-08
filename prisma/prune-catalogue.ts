/**
 * Take the storefront down to products that are actually finished.
 *
 * The catalogue had 2,057 active products and 47 of them were complete. The
 * rest were either the generated sample filler (1,997 of them, no photograph
 * and no price breaks) or real lines still missing a photograph — DA-24. A
 * trade buyer landing on a category of monogram tiles with a single price
 * cannot tell a real range from a placeholder, and neither can the client
 * reviewing it.
 *
 * THE BAR, and both halves matter:
 *
 *   1. At least one image. A buyer confirms they have the right item by
 *      looking at it; a monogram tile is a stand-in, not a listing.
 *   2. At least one volume price break on an active pack. Trade buyers buy on
 *      the break table — a single price is a retail listing wearing a trade
 *      coat.
 *
 * NOTHING IS DELETED. Products that fall short are set Inactive, which is what
 * the storefront already filters on, so they vanish from the shop and stay
 * visible in the admin. Orders, supply rows and history are untouched. The ids
 * are recorded so --restore puts back exactly what this took out and nothing
 * else — the 11 products that were already Inactive before it ran must stay
 * that way.
 *
 * Run with:  npm run db:prune
 * Undo with: npm run db:prune -- --restore
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

/** Where the undo list lives. A Setting row, so it survives a restart. */
const RECORD_KEY = "prunedProductIds";

/** SQLite binds a limited number of parameters per statement. */
function* inBatches<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

const restoring = process.argv.includes("--restore");

/** The storefront reads a cached snapshot keyed on this — see catalog.ts. */
async function bumpCatalogue() {
  const current = await prisma.setting.findUnique({
    where: { key: "catalogVersion" },
  });
  const next = String(Number(current?.value ?? "0") + 1);
  await prisma.setting.upsert({
    where: { key: "catalogVersion" },
    update: { value: next },
    create: { key: "catalogVersion", value: next },
  });
}

async function restore() {
  const record = await prisma.setting.findUnique({ where: { key: RECORD_KEY } });
  if (!record) {
    console.log("Nothing to restore — this has not been run, or was already undone.");
    return;
  }

  const ids: string[] = JSON.parse(record.value);

  // Only the ones this took out. A product somebody has deliberately retired
  // since must not be dragged back onto the shop by an undo.
  //
  // In batches, because SQLite caps how many parameters one statement may
  // bind and two thousand ids is well past it — the whole restore failed with
  // P2029 the first time it was tried.
  let count = 0;
  for (const batch of inBatches(ids, 400)) {
    const { count: n } = await prisma.productMaster.updateMany({
      where: { id: { in: batch }, status: "Inactive" },
      data: { status: "Active" },
    });
    count += n;
  }

  await prisma.setting.delete({ where: { key: RECORD_KEY } });
  await bumpCatalogue();

  console.log(`Restored ${count} product(s) to Active.`);
  if (count < ids.length) {
    console.log(
      `  ${ids.length - count} were not Inactive any more and were left alone.`
    );
  }
}

async function prune() {
  const complete = {
    images: { some: {} },
    skus: { some: { isActive: true, tiers: { some: {} } } },
  };

  const doomed = await prisma.productMaster.findMany({
    where: { status: "Active", NOT: complete },
    select: { id: true, slug: true },
  });

  if (doomed.length === 0) {
    console.log("Every active product already has an image and a price break.");
    return;
  }

  // Counted before the change, for the report. A sample is filler from
  // seed-samples.ts; the rest are real lines with something missing.
  const samples = doomed.filter((p) => p.slug.startsWith("sample-")).length;

  await prisma.productMaster.updateMany({
    where: { id: { in: doomed.map((p) => p.id) } },
    data: { status: "Inactive" },
  });

  // Written after the change, not before: a record of work that did not happen
  // would restore products that were never taken down.
  await prisma.setting.upsert({
    where: { key: RECORD_KEY },
    update: { value: JSON.stringify(doomed.map((p) => p.id)) },
    create: { key: RECORD_KEY, value: JSON.stringify(doomed.map((p) => p.id)) },
  });

  await bumpCatalogue();

  const left = await prisma.productMaster.count({ where: { status: "Active" } });

  console.log(`Deactivated ${doomed.length} product(s):`);
  console.log(`  ${samples} generated sample product(s)`);
  console.log(`  ${doomed.length - samples} real product(s) missing an image or a price break`);
  console.log("");
  console.log(`${left} product(s) now on the storefront, all with an image and volume pricing.`);
  console.log("Undo with: npm run db:prune -- --restore");
}

(restoring ? restore() : prune())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
