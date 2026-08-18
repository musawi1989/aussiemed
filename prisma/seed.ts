/**
 * Seeds the database from src/data/catalog.json.
 *
 * UPSERTS rather than wipes. Once an order exists, its lines reference SKU
 * rows, so deleting the catalogue violates a foreign key — which is the
 * database correctly refusing to let a re-seed destroy order history. Products,
 * SKUs, categories and brands are therefore matched on their natural keys and
 * updated in place.
 *
 * Purely derived rows — price tiers, attributes, images, variant options — are
 * replaced wholesale, because nothing outside the catalogue references them.
 *
 * Run with: npm run db:seed
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { SAMPLE_SKU_PREFIX, SAMPLE_SLUG_PREFIX } from "../src/lib/sample-products.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

/** AED to fils. Money is integer minor units everywhere in the database. */
const fils = (aed: number) => Math.round(aed * 100);

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

type Tier = {
  minQty: number;
  priceAED: number;
  unitName?: string | null;
  unitsPerLevel?: number | null;
};

type Catalog = {
  vatRate: number;
  departments: {
    id: number;
    name: string;
    slug: string;
    children: { id: number; name: string; slug: string }[];
  }[];
  suppliers: { id: number; name: string; isPlaceholder: boolean }[];
  products: {
    id: number;
    slug: string;
    name: string;
    brand: string | null;
    description: string | null;
    categoryPath: { id: number }[];
    unit: string;
    supplierId: number;
    outOfStock: boolean;
    images: string[];
    taxClass: "standard" | "zero-rated";
    variantGroup?: string | null;
    variantLabel?: string | null;
    packs: {
      id: string;
      sku: string;
      label: string;
      shortLabel: string;
      eachesPerPack: number;
      priceAED: number;
      tiers: Tier[];
      outOfStock: boolean;
    }[];
    variants: {
      name: string;
      selected: string;
      options: { value: string; available: boolean }[];
    }[];
    attributes: { label: string; value: string }[];
  }[];
};

const catalog = JSON.parse(
  readFileSync(resolve(root, "src/data/catalog.json"), "utf8")
) as Catalog;

console.log("\nSeeding from src/data/catalog.json\n");

/* ------------------------------------------------------------------ *
 * Derived rows only — safe to replace
 * ------------------------------------------------------------------ */

/**
 * Everything here is rebuilt from catalog.json a few lines below, so wiping it
 * first is how a removed tier or a re-filed category actually leaves.
 *
 * Sample products are the exception, and it has to be stated in every one of
 * these: they are not in catalog.json, so nothing here would put their rows
 * back. Their category links in particular — clearing those would leave 727
 * products uncategorised, empty the 149 categories they fill, and fail
 * db:check's "no product is left uncategorised", all from a command whose
 * whole job is to be safe to re-run. See DA-33.
 */
const notSample = { product: { NOT: { slug: { startsWith: SAMPLE_SLUG_PREFIX } } } };
const notSampleSku = { sku: { NOT: { skuCode: { startsWith: SAMPLE_SKU_PREFIX } } } };

await prisma.skuOptionValue.deleteMany({ where: notSampleSku });
await prisma.productOptionValue.deleteMany({ where: { option: notSample } });
await prisma.productOption.deleteMany({ where: notSample });
await prisma.priceTier.deleteMany({ where: notSampleSku });
await prisma.productAttribute.deleteMany({ where: notSample });
await prisma.productImage.deleteMany({ where: notSample });
await prisma.productCategory.deleteMany({ where: notSample });

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

const vatBp = String(Math.round(catalog.vatRate * 10000));
await prisma.setting.upsert({
  where: { key: "vatRateBasisPoints" },
  update: { value: vatBp },
  create: { key: "vatRateBasisPoints", value: vatBp },
});
await prisma.setting.upsert({
  where: { key: "currency" },
  update: { value: "AED" },
  create: { key: "currency", value: "AED" },
});

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

/**
 * The catalogue seeds the tree ONCE, on an empty database, and never touches it
 * again.
 *
 * It used to upsert every category on every run, which quietly undid every
 * deliberate edit made since the import. On 18 Aug it re-created "Piercing
 * Supplies" under Beauty — a shelf that had been moved to Tattoo & Piercing
 * where a buyer would actually look for it, and the empty original removed on
 * purpose. Anything an admin deleted came back on the next re-seed, and there
 * is no way for this file to tell "deleted deliberately" from "never existed".
 *
 * So the database owns the tree, which is the same conclusion DA-27 reached
 * when db:check stopped comparing categories against this file: catalog.json is
 * generated from a frozen scrape, and a frozen scrape cannot be the authority
 * on a taxonomy people edit. A category in the file that is not in the database
 * is reported rather than silently recreated — a product filed only under a
 * removed shelf is something to look at.
 */
const categoryIdByNumeric = new Map<number, string>();
const treeIsEmpty = (await prisma.category.count()) === 0;
const missingCategories: string[] = [];

for (const [i, dept] of catalog.departments.entries()) {
  const created = treeIsEmpty
    ? await prisma.category.create({
        data: { name: dept.name, slug: dept.slug, sortOrder: i },
      })
    : await prisma.category.findUnique({ where: { slug: dept.slug } });

  if (!created) {
    missingCategories.push(dept.slug);
    continue;
  }
  categoryIdByNumeric.set(dept.id, created.id);

  for (const [j, child] of dept.children.entries()) {
    const kid = treeIsEmpty
      ? await prisma.category.create({
          data: {
            name: child.name,
            slug: child.slug,
            parentId: created.id,
            sortOrder: j,
          },
        })
      : await prisma.category.findUnique({ where: { slug: child.slug } });

    if (!kid) {
      missingCategories.push(child.slug);
      continue;
    }
    categoryIdByNumeric.set(child.id, kid.id);
  }
}
console.log(
  `  categories        ${categoryIdByNumeric.size}${treeIsEmpty ? " (created — empty database)" : " (matched; the database owns the tree)"}`
);
if (missingCategories.length > 0) {
  console.log(
    `  NOT IN DATABASE   ${missingCategories.length}: ${missingCategories.join(", ")}`
  );
  console.log("                    removed deliberately? products filed only there lose their link.");
}

/* ------------------------------------------------------------------ *
 * Suppliers
 * ------------------------------------------------------------------ */

const supplierIdByNumeric = new Map<number, string>();

for (const supplier of catalog.suppliers) {
  const handle = slugify(supplier.name);
  const existing = await prisma.supplier.findFirst({
    where: { companyName: supplier.name },
  });

  const row = existing
    ? existing
    : await prisma.supplier.create({
        data: {
          companyName: supplier.name,
          // secondaryEmail is mandatory at creation — a locked decision.
          primaryEmail: `orders@${handle}.example`,
          secondaryEmail: `accounts@${handle}.example`,
          status: "Active",
        },
      });

  supplierIdByNumeric.set(supplier.id, row.id);
}
console.log(`  suppliers         ${supplierIdByNumeric.size}`);

/* ------------------------------------------------------------------ *
 * Brands
 * ------------------------------------------------------------------ */

const brandIdByName = new Map<string, string>();

for (const name of [
  ...new Set(catalog.products.map((p) => p.brand).filter(Boolean) as string[]),
]) {
  const row = await prisma.brand.upsert({
    where: { name },
    update: {},
    create: { name, slug: slugify(name) },
  });
  brandIdByName.set(name, row.id);
}
console.log(`  brands            ${brandIdByName.size}`);

/* ------------------------------------------------------------------ *
 * Products and SKUs
 * ------------------------------------------------------------------ */

let skuCount = 0;
let tierCount = 0;
let optionValueCount = 0;
const seenSlugs = new Set<string>();
const seenSkuCodes = new Set<string>();

for (const product of catalog.products) {
  seenSlugs.add(product.slug);

  /**
   * No supplier on the product, and no skipping a product whose supplier is
   * unknown. Both were right when a product was owned by one supplier, and
   * both broke the moment BE-40 removed ProductMaster.supplierId: this seed
   * has thrown on its first product since 16 Aug, and nobody noticed because
   * nobody re-seeded until the Oral Care merge on 18 Aug — which wiped the
   * category links on its way to the crash.
   *
   * Supply is ProductSupply now: a primary, a backup, and a cost for each
   * (DEC-25). It is not seeded from the catalogue at all, because who supplies
   * a line is a commercial fact the catalogue file has no business asserting.
   */
  const data = {
    name: product.name,
    description: product.description,
    brandId: product.brand ? brandIdByName.get(product.brand) : null,
    status: "Active",
    taxClass: (product.taxClass === "zero-rated" ? "ZeroRated" : "Standard") as string,
    variantGroup: product.variantGroup ?? null,
    variantLabel: product.variantLabel ?? null,
  };

  const master = await prisma.productMaster.upsert({
    where: { slug: product.slug },
    update: data,
    create: {
      ...data,
      slug: product.slug,
      approvedAt: new Date("2026-08-14T00:00:00Z"),
    },
  });

  await prisma.productCategory.createMany({
    data: product.categoryPath
      .map((n) => categoryIdByNumeric.get(n.id))
      .filter((id): id is string => Boolean(id))
      .map((categoryId) => ({ productMasterId: master.id, categoryId })),
  });

  await prisma.productImage.createMany({
    data: product.images.map((path, sortOrder) => ({
      productMasterId: master.id,
      path,
      altText: product.name,
      sortOrder,
    })),
  });

  await prisma.productAttribute.createMany({
    data: product.attributes.map((a, sortOrder) => ({
      productMasterId: master.id,
      label: a.label,
      value: a.value,
      sortOrder,
    })),
  });

  for (const pack of product.packs) {
    const skuData = {
      productMasterId: master.id,
      baseUnitName: pack.shortLabel || product.unit || "Each",
      unitLabel: pack.label,
      unitShortLabel: pack.shortLabel,
      isActive: true,
      eachesPerPack: pack.eachesPerPack,
      priceFils: fils(pack.priceAED),
      manualOutOfStock: pack.outOfStock || product.outOfStock,
    };

    const sku = await prisma.productSku.upsert({
      where: { skuCode: pack.sku },
      update: skuData,
      create: { ...skuData, skuCode: pack.sku, isActive: true },
    });
    seenSkuCodes.add(pack.sku);
    skuCount += 1;

    await prisma.priceTier.createMany({
      data: pack.tiers.map((t) => ({
        skuId: sku.id,
        minQty: t.minQty,
        priceFils: fils(t.priceAED),
        unitName: t.unitName ?? null,
        unitsPerLevel: t.unitsPerLevel ?? null,
      })),
    });
    tierCount += pack.tiers.length;

    if (pack.id === product.packs[0].id) {
      for (const [sortOrder, axis] of product.variants.entries()) {
        const option = await prisma.productOption.create({
          data: { productMasterId: master.id, name: axis.name, sortOrder },
        });
        for (const [i, opt] of axis.options.entries()) {
          const value = await prisma.productOptionValue.create({
            data: { optionId: option.id, value: opt.value, sortOrder: i },
          });
          optionValueCount += 1;
          if (opt.value === axis.selected) {
            await prisma.skuOptionValue.create({
              data: { skuId: sku.id, valueId: value.id },
            });
          }
        }
      }
    }
  }
}

/**
 * Anything that has left the catalogue is deactivated, never deleted — an
 * order line still points at its SKU, and that history must survive.
 *
 * This matters more than it looks: when packaging moved from separate carton
 * SKUs into named price breaks, 23 carton SKUs stopped being part of the
 * catalogue while still being referenced by existing orders.
 *
 * Sample products are exempt. They are never in catalog.json — they are
 * generated against the database's own category tree by seed-samples.ts — so
 * this sweep would switch all 750 of them off the moment anybody re-seeded the
 * catalogue, and the storefront would empty out with nothing to explain it.
 * See DA-33.
 */
const retired = await prisma.productMaster.updateMany({
  where: {
    slug: { notIn: [...seenSlugs] },
    status: "Active",
    NOT: { slug: { startsWith: SAMPLE_SLUG_PREFIX } },
  },
  data: { status: "Inactive" },
});

const retiredSkus = await prisma.productSku.updateMany({
  where: {
    skuCode: { notIn: [...seenSkuCodes] },
    isActive: true,
    NOT: { skuCode: { startsWith: SAMPLE_SKU_PREFIX } },
  },
  data: { isActive: false },
});

/**
 * Suppliers are NOT swept, and that is a change.
 *
 * This used to suspend any supplier not named in catalog.json, which made
 * sense while a product was owned by one supplier and the catalogue was the
 * only place they came from. Since DEC-25 they are onboarded in the admin,
 * they carry their own portal logins, their own supply terms and their own
 * purchase orders — and catalog.json is built from a scrape that predates all
 * of it.
 *
 * Left in, the sweep suspended two working suppliers on this database on
 * 18 Aug, one of them with a portal login, eleven supply terms and two
 * purchase orders against it. A JSON file built from an old scrape has no
 * business deciding we have stopped buying from a company. Suspending a
 * supplier is a decision somebody takes on /admin/suppliers.
 */
if (retiredSkus.count > 0) {
  console.log(`  retired skus      ${retiredSkus.count} (deactivated, not deleted)`);
}

console.log(`  products          ${seenSlugs.size}`);
console.log(`  skus              ${skuCount}`);
console.log(`  price tiers       ${tierCount}`);
console.log(`  option values     ${optionValueCount}`);
if (retired.count > 0) {
  console.log(`  retired           ${retired.count} (deactivated, not deleted)`);
}

const families = await prisma.productMaster.groupBy({
  by: ["variantGroup"],
  where: { variantGroup: { not: null } },
  _count: true,
});
console.log(
  `  variant families  ${families.filter((f) => f._count > 1).length}`
);

const outOfStock = await prisma.productSku.count({
  where: { manualOutOfStock: true },
});
console.log(`  out of stock skus ${outOfStock}`);

/**
 * Bump the stamp the storefront's cache checks itself against, so a running
 * dev server picks this seed up within a second instead of serving whatever it
 * read at boot. Written inline rather than imported from src/lib/catalog.ts,
 * which is marked server-only and cannot load outside Next.
 */
const current = await prisma.setting.findUnique({
  where: { key: "catalogVersion" },
});
const next = String(Number(current?.value ?? "0") + 1);
await prisma.setting.upsert({
  where: { key: "catalogVersion" },
  update: { value: next },
  create: { key: "catalogVersion", value: next },
});
console.log(`  catalog version   ${next}`);

await prisma.$disconnect();
console.log("\nSeed complete\n");
