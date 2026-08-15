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

await prisma.skuOptionValue.deleteMany();
await prisma.productOptionValue.deleteMany();
await prisma.productOption.deleteMany();
await prisma.priceTier.deleteMany();
await prisma.productAttribute.deleteMany();
await prisma.productImage.deleteMany();
await prisma.productCategory.deleteMany();

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

const categoryIdByNumeric = new Map<number, string>();

for (const [i, dept] of catalog.departments.entries()) {
  const created = await prisma.category.upsert({
    where: { slug: dept.slug },
    update: { name: dept.name, sortOrder: i, parentId: null },
    create: { name: dept.name, slug: dept.slug, sortOrder: i },
  });
  categoryIdByNumeric.set(dept.id, created.id);

  for (const [j, child] of dept.children.entries()) {
    const kid = await prisma.category.upsert({
      where: { slug: child.slug },
      update: { name: child.name, parentId: created.id, sortOrder: j },
      create: {
        name: child.name,
        slug: child.slug,
        parentId: created.id,
        sortOrder: j,
      },
    });
    categoryIdByNumeric.set(child.id, kid.id);
  }
}
console.log(`  categories        ${categoryIdByNumeric.size}`);

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
  const supplierId = supplierIdByNumeric.get(product.supplierId);
  if (!supplierId) {
    console.log(`  SKIP ${product.name} — unknown supplier`);
    continue;
  }
  seenSlugs.add(product.slug);

  const data = {
    name: product.name,
    description: product.description,
    brandId: product.brand ? brandIdByName.get(product.brand) : null,
    supplierId,
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
 */
const retired = await prisma.productMaster.updateMany({
  where: { slug: { notIn: [...seenSlugs] }, status: "Active" },
  data: { status: "Inactive" },
});

const retiredSkus = await prisma.productSku.updateMany({
  where: { skuCode: { notIn: [...seenSkuCodes] }, isActive: true },
  data: { isActive: false },
});
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

await prisma.$disconnect();
console.log("\nSeed complete\n");
