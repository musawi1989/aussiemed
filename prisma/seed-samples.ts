/**
 * Fills every sub-category with sample products, so the whole tree can be
 * browsed before the real catalogue lands — DA-33, at the client's request on
 * 18 Aug 2026.
 *
 * These are invented and say so: "Endodontics sample product 3", item code
 * SAMPLE-ENDODONTICS-3, and the placeholder notice every seeded product already
 * carries on its page. Nobody should be able to mistake one for stock.
 *
 * SAFE TO RE-RUN. Products are matched on slug and updated in place, so running
 * it twice adds nothing. A category that already holds five or more real
 * products is left alone — this tops up, it does not pad.
 *
 * Run with:  npm run db:seed:samples
 * Remove:    npm run db:seed:samples -- --remove
 *
 * The removal refuses to delete a sample somebody has ordered, because an order
 * line points at its SKU and that history has to survive. It reports them
 * instead of quietly skipping, since a sample sitting in a real order is
 * something to look at, not something to work around.
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import {
  SAMPLE_DESCRIPTION,
  SAMPLE_SKU_PREFIX,
  SAMPLE_SLUG_PREFIX,
  SAMPLES_PER_CATEGORY,
  samplePack,
  samplePriceFils,
  sampleName,
  sampleOutOfStock,
  sampleSkuCode,
  sampleSlug,
  samplesNeeded,
} from "../src/lib/sample-products.ts";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const remove = process.argv.includes("--remove");

/**
 * The storefront caches the catalogue in-process and re-checks this stamp
 * before serving it, so anything that writes products has to move it or a
 * running server keeps handing out the catalogue it read at boot. Written
 * inline rather than imported, exactly as prisma/seed.ts does: src/lib/catalog
 * is server-only and cannot load outside Next.
 *
 * Found the hard way — the first run of this script created 727 products and
 * the site kept showing 60.
 */
async function bumpCatalogVersion(): Promise<string> {
  const current = await prisma.setting.findUnique({ where: { key: "catalogVersion" } });
  const next = String(Number(current?.value ?? "0") + 1);
  await prisma.setting.upsert({
    where: { key: "catalogVersion" },
    update: { value: next },
    create: { key: "catalogVersion", value: next },
  });
  return next;
}

/* ------------------------------------------------------------------ *
 * Removal
 * ------------------------------------------------------------------ */

if (remove) {
  console.log("\nRemoving sample products\n");

  const samples = await prisma.productMaster.findMany({
    where: { slug: { startsWith: SAMPLE_SLUG_PREFIX } },
    select: { id: true, slug: true, skus: { select: { id: true, skuCode: true } } },
  });

  const ordered = await prisma.orderItem.findMany({
    where: { skuId: { in: samples.flatMap((p) => p.skus.map((s) => s.id)) } },
    select: { skuId: true, order: { select: { reference: true } } },
  });
  const orderedSkuIds = new Set(ordered.map((line) => line.skuId));

  const deletable = samples.filter((p) => !p.skus.some((s) => orderedSkuIds.has(s.id)));
  const kept = samples.filter((p) => p.skus.some((s) => orderedSkuIds.has(s.id)));

  for (const product of deletable) {
    // Derived rows first: the schema cascades some of these and restricts
    // others, and relying on which is which is how a delete becomes a surprise.
    await prisma.priceTier.deleteMany({
      where: { skuId: { in: product.skus.map((s) => s.id) } },
    });
    await prisma.productSku.deleteMany({ where: { productMasterId: product.id } });
    await prisma.productCategory.deleteMany({ where: { productMasterId: product.id } });
    await prisma.productAttribute.deleteMany({ where: { productMasterId: product.id } });
    await prisma.productImage.deleteMany({ where: { productMasterId: product.id } });
    await prisma.productMaster.delete({ where: { id: product.id } });
  }

  console.log(`  ${deletable.length} sample product(s) removed.`);
  console.log(`  catalog version    ${await bumpCatalogVersion()}`);
  if (kept.length > 0) {
    console.log(`\n  ${kept.length} kept because an order references them:`);
    for (const product of kept) {
      const references = ordered
        .filter((line) => product.skus.some((s) => s.id === line.skuId))
        .map((line) => line.order.reference);
      console.log(`    ${product.slug} — ${[...new Set(references)].join(", ")}`);
    }
    console.log("\n  Deactivate those by hand if they should leave the storefront.");
  }

  await prisma.$disconnect();
  process.exit(0);
}

/* ------------------------------------------------------------------ *
 * Filling
 * ------------------------------------------------------------------ */

console.log("\nFilling every sub-category with sample products\n");

/**
 * LEAVES only — a category with nothing below it.
 *
 * Departments are excluded because their count is the sum of what is beneath
 * them, so filling both would put five unnecessary products on a department its
 * children already fill. Since dental went three deep (DA-41) the same argument
 * excludes the middle level: Endodontics holds nineteen shelves of its own and
 * does not need five products of its own on top of them.
 */
const all = await prisma.category.findMany({
  select: {
    id: true,
    name: true,
    slug: true,
    parentId: true,
    products: {
      where: { product: { status: "Active" } },
      select: { productMasterId: true },
    },
  },
  orderBy: { sortOrder: "asc" },
});

const parentIds = new Set(all.map((c) => c.parentId).filter(Boolean) as string[]);
const byId = new Map(all.map((c) => [c.id, c]));

/** Every category above this one, nearest first. */
const ancestorsOf = (id: string): string[] => {
  const out: string[] = [];
  let current = byId.get(id);
  while (current?.parentId) {
    out.push(current.parentId);
    current = byId.get(current.parentId);
  }
  return out;
};

const categories = all.filter((c) => c.parentId !== null && !parentIds.has(c.id));

/**
 * No supplier is attached, deliberately. A product is not owned by a supplier
 * any more — supply terms live in ProductSupply with a primary and a backup
 * (DEC-25) — and inventing terms for 727 products nobody sources would put
 * fictional costs into the margin figures and fictional lines into the daily
 * buying run. A sample that reaches the purchasing screen lands in the
 * unsourceable queue, which is the honest answer.
 */

let created = 0;
let updated = 0;
let skipped = 0;

for (const category of categories) {
  const needed = samplesNeeded(category.products.length);
  if (needed === 0) {
    skipped += 1;
    continue;
  }

  // Fill the highest numbers first is wrong — a category holding two real
  // products should gain samples 1..3, not 3..5, so the numbering stays dense
  // and the same category always produces the same slugs.
  for (let n = 1; n <= needed; n += 1) {
    const slug = sampleSlug(category.slug, n);
    const skuCode = sampleSkuCode(category.slug, n);
    const pack = samplePack(n);

    const existing = await prisma.productMaster.findUnique({
      where: { slug },
      select: { id: true },
    });

    const master = await prisma.productMaster.upsert({
      where: { slug },
      update: { name: sampleName(category.name, n), status: "Active" },
      create: {
        slug,
        name: sampleName(category.name, n),
        description: SAMPLE_DESCRIPTION,
        status: "Active",
        taxClass: "Standard",
        approvedAt: new Date("2026-08-18T00:00:00Z"),
      },
    });

    /**
     * Filed against the shelf AND every category above it, which since dental
     * went three deep means up to three links rather than two. A product's path
     * is what the breadcrumb reads and what every count rolls up from, so a
     * sample that named only its own shelf would leave Dental reading as empty
     * while holding 1,300 products. Replaced rather than added to, so
     * re-running cannot file one sample twice.
     */
    await prisma.productCategory.deleteMany({ where: { productMasterId: master.id } });
    await prisma.productCategory.createMany({
      data: [category.id, ...ancestorsOf(category.id)].map((categoryId) => ({
        productMasterId: master.id,
        categoryId,
      })),
    });

    await prisma.productSku.upsert({
      where: { skuCode },
      update: {
        productMasterId: master.id,
        baseUnitName: pack.unitShortLabel,
        unitLabel: pack.unitLabel,
        unitShortLabel: pack.unitShortLabel,
        eachesPerPack: pack.eachesPerPack,
        priceFils: samplePriceFils(category.slug, n),
        manualOutOfStock: sampleOutOfStock(n),
        isActive: true,
      },
      create: {
        skuCode,
        productMasterId: master.id,
        baseUnitName: pack.unitShortLabel,
        unitLabel: pack.unitLabel,
        unitShortLabel: pack.unitShortLabel,
        eachesPerPack: pack.eachesPerPack,
        priceFils: samplePriceFils(category.slug, n),
        manualOutOfStock: sampleOutOfStock(n),
        isActive: true,
      },
    });

    if (existing) updated += 1;
    else created += 1;
  }
}

const total = await prisma.productMaster.count({
  where: { slug: { startsWith: SAMPLE_SLUG_PREFIX }, status: "Active" },
});
const thin = categories.filter((c) => c.products.length + samplesNeeded(c.products.length) < SAMPLES_PER_CATEGORY);

console.log(`  categories filled  ${categories.length - skipped}`);
console.log(`  already full       ${skipped}`);
console.log(`  products created   ${created}`);
console.log(`  products updated   ${updated}`);
console.log(`  samples in total   ${total} (item codes start ${SAMPLE_SKU_PREFIX})`);
console.log(`  catalog version    ${await bumpCatalogVersion()}`);
if (thin.length > 0) console.log(`  STILL THIN         ${thin.map((c) => c.slug).join(", ")}`);
console.log("\n  Remove them all with: npm run db:seed:samples -- --remove\n");

await prisma.$disconnect();
