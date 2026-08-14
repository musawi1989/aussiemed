/**
 * Seeds the database from src/data/catalog.json — the same generated catalogue
 * the storefront renders, so the database and the JSON cannot disagree.
 *
 * Idempotent: it clears the catalogue tables first, so it can be re-run after
 * regenerating the catalogue. It does NOT clear orders, because losing order
 * history to a re-seed is exactly the kind of accident that should be hard.
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
    sku: string;
    name: string;
    brand: string | null;
    description: string | null;
    categoryId: number | null;
    categoryPath: { id: number }[];
    priceAED: number;
    unit: string;
    packSize: string | null;
    supplierId: number;
    outOfStock: boolean;
    images: string[];
    taxClass: "standard" | "zero-rated";
    packs: {
      id: string;
      sku: string;
      label: string;
      shortLabel: string;
      eachesPerPack: number;
      priceAED: number;
      tiers: { minQty: number; priceAED: number }[];
      outOfStock: boolean;
    }[];
    variants: {
      name: string;
      selected: string;
      options: { value: string; available: boolean }[];
    }[];
    attributes: { label: string; value: string }[];
    isPlaceholder: boolean;
  }[];
};

const catalog = JSON.parse(
  readFileSync(resolve(root, "src/data/catalog.json"), "utf8")
) as Catalog;

console.log("\nSeeding from src/data/catalog.json\n");

/* ------------------------------------------------------------------ *
 * Clear catalogue tables only
 * ------------------------------------------------------------------ */

// Order matters: children before parents. Orders and users are left alone.
await prisma.skuOptionValue.deleteMany();
await prisma.productOptionValue.deleteMany();
await prisma.productOption.deleteMany();
await prisma.priceTier.deleteMany();
await prisma.productAttribute.deleteMany();
await prisma.productDocument.deleteMany();
await prisma.productImage.deleteMany();
await prisma.skuBatch.deleteMany();
await prisma.cartItem.deleteMany();
await prisma.productSku.deleteMany();
await prisma.productCategory.deleteMany();
await prisma.wishlistItem.deleteMany();
await prisma.productMaster.deleteMany();
await prisma.category.deleteMany();
await prisma.brand.deleteMany();

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

// Basis points, so 5% is 500 and there is no float in the config either.
await prisma.setting.upsert({
  where: { key: "vatRateBasisPoints" },
  update: { value: String(Math.round(catalog.vatRate * 10000)) },
  create: {
    key: "vatRateBasisPoints",
    value: String(Math.round(catalog.vatRate * 10000)),
  },
});
await prisma.setting.upsert({
  where: { key: "currency" },
  update: { value: "AED" },
  create: { key: "currency", value: "AED" },
});

/* ------------------------------------------------------------------ *
 * Categories — the two-level tree
 * ------------------------------------------------------------------ */

const categoryIdByNumeric = new Map<number, string>();

for (const [i, dept] of catalog.departments.entries()) {
  const created = await prisma.category.create({
    data: { name: dept.name, slug: dept.slug, sortOrder: i },
  });
  categoryIdByNumeric.set(dept.id, created.id);

  for (const [j, child] of dept.children.entries()) {
    const kid = await prisma.category.create({
      data: {
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

  // Matched by company name rather than created outright. Suppliers cannot be
  // cleared like the catalogue tables — orders and invoices reference them —
  // so creating blindly duplicated every supplier on a second run.
  const existing = await prisma.supplier.findFirst({
    where: { companyName: supplier.name },
  });

  const row = existing
    ? await prisma.supplier.update({
        where: { id: existing.id },
        data: { status: "Active" },
      })
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
  const created = await prisma.brand.create({
    data: { name, slug: slugify(name) },
  });
  brandIdByName.set(name, created.id);
}
console.log(`  brands            ${brandIdByName.size}`);

/* ------------------------------------------------------------------ *
 * Products, SKUs, tiers, variants, attributes
 * ------------------------------------------------------------------ */

let skuCount = 0;
let tierCount = 0;
let optionValueCount = 0;

for (const product of catalog.products) {
  const supplierId = supplierIdByNumeric.get(product.supplierId);
  if (!supplierId) {
    console.log(`  SKIP ${product.name} — unknown supplier ${product.supplierId}`);
    continue;
  }

  const master = await prisma.productMaster.create({
    data: {
      name: product.name,
      slug: product.slug,
      description: product.description,
      brandId: product.brand ? brandIdByName.get(product.brand) : undefined,
      supplierId,
      // Seeded products are live so the storefront has something to show.
      status: "Active",
      approvedAt: new Date("2026-08-14T00:00:00Z"),
      taxClass: product.taxClass === "zero-rated" ? "ZeroRated" : "Standard",
      categories: {
        create: product.categoryPath
          .map((node) => categoryIdByNumeric.get(node.id))
          .filter((id): id is string => Boolean(id))
          .map((categoryId) => ({ categoryId })),
      },
      images: {
        create: product.images.map((path, sortOrder) => ({
          path,
          altText: product.name,
          sortOrder,
        })),
      },
      attributes: {
        create: product.attributes.map((a, sortOrder) => ({
          label: a.label,
          value: a.value,
          sortOrder,
        })),
      },
    },
  });

  // Each pack is a SKU — this is the shape that matters most.
  for (const pack of product.packs) {
    const sku = await prisma.productSku.create({
      data: {
        productMasterId: master.id,
        skuCode: pack.sku,
        unitLabel: pack.label,
        unitShortLabel: pack.shortLabel,
        eachesPerPack: pack.eachesPerPack,
        priceFils: fils(pack.priceAED),
        manualOutOfStock: pack.outOfStock || product.outOfStock,
        tiers: {
          create: pack.tiers.map((t) => ({
            minQty: t.minQty,
            priceFils: fils(t.priceAED),
          })),
        },
      },
    });
    skuCount += 1;
    tierCount += pack.tiers.length;

    // The variant axes describe the product; attach them to the base SKU so
    // Size=Large is recorded against something purchasable.
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

console.log(`  products          ${catalog.products.length}`);
console.log(`  skus              ${skuCount}`);
console.log(`  price tiers       ${tierCount}`);
console.log(`  option values     ${optionValueCount}`);

/* ------------------------------------------------------------------ *
 * Demo accounts — spec section 8
 * ------------------------------------------------------------------ */

const org = await prisma.organisation.upsert({
  where: { id: "demo-org" },
  update: {},
  create: {
    id: "demo-org",
    name: "Al Barsha Family Clinic",
    emirate: "Dubai",
    paymentTerms: "Net30",
    creditLimitFils: fils(25000),
  },
});

await prisma.user.upsert({
  where: { email: "admin@aussiemed.local" },
  update: {},
  create: {
    email: "admin@aussiemed.local",
    name: "AussieMed Admin",
    role: "Admin",
    isVerified: true,
  },
});

await prisma.user.upsert({
  where: { email: "procurement@albarshaclinic.example" },
  update: {},
  create: {
    email: "procurement@albarshaclinic.example",
    name: "Layla Haddad",
    role: "Customer",
    isVerified: true,
    organisationId: org.id,
  },
});

await prisma.address.upsert({
  where: { id: "demo-address" },
  update: {},
  create: {
    id: "demo-address",
    organisationId: org.id,
    label: "Clinic",
    contact: "Layla Haddad",
    phone: "+971 4 000 0000",
    line1: "Al Barsha 1",
    city: "Dubai",
    emirate: "Dubai",
    isDefault: true,
  },
});

console.log(`  demo users        2 (1 admin, 1 customer) + 1 organisation`);

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

const outOfStock = await prisma.productSku.count({
  where: { manualOutOfStock: true },
});
console.log(`  out of stock skus ${outOfStock}`);

await prisma.$disconnect();
console.log("\nSeed complete\n");
