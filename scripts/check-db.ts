/**
 * Verifies the seeded database against src/data/catalog.json.
 *
 * The storefront still renders from the JSON while the API is being built, so
 * the two must agree exactly. This catches a seed that silently drops rows, and
 * — more importantly — any money that does not survive the round trip through
 * integer fils.
 *
 * Run with: npm run db:check
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const catalog = JSON.parse(
  readFileSync(resolve(root, "src/data/catalog.json"), "utf8")
);

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

console.log("\nDatabase checks\n");

/* ---------- counts ---------- */

const expectedCategories =
  catalog.departments.length +
  catalog.departments.reduce((n: number, d: any) => n + d.children.length, 0);

check(
  "category count matches the catalogue",
  (await prisma.category.count()) === expectedCategories,
  `db=${await prisma.category.count()} json=${expectedCategories}`
);

check(
  "product count matches the catalogue",
  (await prisma.productMaster.count()) === catalog.products.length,
  `db=${await prisma.productMaster.count()} json=${catalog.products.length}`
);

const expectedSkus = catalog.products.reduce(
  (n: number, p: any) => n + p.packs.length,
  0
);
check(
  "every pack became a SKU",
  (await prisma.productSku.count()) === expectedSkus,
  `db=${await prisma.productSku.count()} json=${expectedSkus}`
);

check(
  "supplier count matches",
  (await prisma.supplier.count()) === catalog.suppliers.length
);

/* ---------- structural ---------- */

const productsWithoutSku = await prisma.productMaster.count({
  where: { skus: { none: {} } },
});
check(
  "no product exists without a purchasable SKU",
  productsWithoutSku === 0,
  `${productsWithoutSku} orphaned`
);

const productsWithoutCategory = await prisma.productMaster.count({
  where: { categories: { none: {} } },
});
check(
  "no product is left uncategorised",
  productsWithoutCategory === 0,
  `${productsWithoutCategory} uncategorised`
);

const rootCategories = await prisma.category.count({ where: { parentId: null } });
check(
  "the category tree has the expected departments",
  rootCategories === catalog.departments.length,
  `db=${rootCategories} json=${catalog.departments.length}`
);

/* ---------- money round trip ---------- */

// The whole reason money is stored as integer fils is that it must survive
// exactly. Compare every SKU and every tier back to the source AED figure.
const skus = await prisma.productSku.findMany({
  include: { tiers: true, product: true },
});
const skuByCode = new Map(skus.map((s) => [s.skuCode, s]));

let priceMismatch: string | null = null;
let tierMismatch: string | null = null;

for (const product of catalog.products) {
  for (const pack of product.packs) {
    const sku = skuByCode.get(pack.sku);
    if (!sku) {
      priceMismatch ??= `${pack.sku} missing from the database`;
      continue;
    }
    if (sku.priceFils !== Math.round(pack.priceAED * 100)) {
      priceMismatch ??= `${pack.sku}: db=${sku.priceFils} fils, json=${pack.priceAED} AED`;
    }
    for (const tier of pack.tiers) {
      const row = sku.tiers.find((t) => t.minQty === tier.minQty);
      if (!row) {
        tierMismatch ??= `${pack.sku} missing tier ${tier.minQty}+`;
      } else if (row.priceFils !== Math.round(tier.priceAED * 100)) {
        tierMismatch ??= `${pack.sku} tier ${tier.minQty}+: db=${row.priceFils} fils, json=${tier.priceAED} AED`;
      }
    }
  }
}

check("every SKU price round-trips exactly through fils", priceMismatch === null, priceMismatch ?? "");
check("every volume break round-trips exactly through fils", tierMismatch === null, tierMismatch ?? "");

// Integer fils means no fractional currency can exist at all.
const fractional = skus.filter((s) => !Number.isInteger(s.priceFils));
check("no price is fractional", fractional.length === 0, `${fractional.length} fractional`);

/* ---------- tax ---------- */

const zeroRated = await prisma.productMaster.count({
  where: { taxClass: "ZeroRated" },
});
const jsonZeroRated = catalog.products.filter(
  (p: any) => p.taxClass === "zero-rated"
).length;
check(
  "zero-rated classification carried across",
  zeroRated === jsonZeroRated,
  `db=${zeroRated} json=${jsonZeroRated}`
);

const badTaxClass = await prisma.productMaster.count({
  where: { NOT: { taxClass: { in: ["Standard", "ZeroRated"] } } },
});
check("every product has a valid tax class", badTaxClass === 0);

/* ---------- tiers are well formed ---------- */

const badTier = skus.find((s) => {
  const sorted = [...s.tiers].sort((a, b) => a.minQty - b.minQty);
  let floor = s.priceFils;
  for (const t of sorted) {
    if (t.minQty <= 1 || t.priceFils >= floor) return true;
    floor = t.priceFils;
  }
  return false;
});
check(
  "tiers ascend by quantity and descend in price",
  badTier === undefined,
  badTier?.skuCode
);

/* ---------- settings ---------- */

const vat = await prisma.setting.findUnique({
  where: { key: "vatRateBasisPoints" },
});
check(
  "VAT rate is stored as basis points",
  vat?.value === String(Math.round(catalog.vatRate * 10000)),
  `got ${vat?.value}`
);

/* ---------- orders ---------- */

// Orders are the point of no return: once written they are a document the
// customer keeps, so the invariants matter more here than anywhere.
const orders = await prisma.order.findMany({
  include: { invoices: { include: { items: true } } },
});

if (orders.length === 0) {
  console.log("  SKIP  no orders placed yet");
} else {
  const badSplit = orders.find((o) => {
    const suppliers = new Set(o.invoices.map((i) => i.supplierId));
    return suppliers.size !== o.invoices.length;
  });
  check(
    "each order has exactly one invoice per supplier",
    badSplit === undefined,
    badSplit?.reference
  );

  const badSubtotal = orders.find(
    (o) => o.invoices.reduce((n, i) => n + i.subtotalFils, 0) !== o.subtotalFils
  );
  check(
    "invoice subtotals sum to the order subtotal",
    badSubtotal === undefined,
    badSubtotal?.reference
  );

  const badVat = orders.find(
    (o) => o.invoices.reduce((n, i) => n + i.vatFils, 0) !== o.vatFils
  );
  check(
    "invoice VAT sums to the order VAT, with no rounding drift",
    badVat === undefined,
    badVat?.reference
  );

  const badTotal = orders.find(
    (o) => o.subtotalFils + o.vatFils !== o.totalFils
  );
  check("order total equals subtotal plus VAT", badTotal === undefined, badTotal?.reference);

  const badLines = orders.find((o) =>
    o.invoices.some((i) =>
      i.items.some(
        (it) =>
          it.qty < 1 ||
          it.lineTotalFils !== it.unitPriceFils * it.qty ||
          !Number.isInteger(it.vatFils)
      )
    )
  );
  check(
    "every order line is a whole quantity priced in whole fils",
    badLines === undefined,
    badLines?.reference
  );

  // A zero-rated line must carry no VAT, however the rate later changes.
  const badZeroRated = orders.find((o) =>
    o.invoices.some((i) =>
      i.items.some((it) => it.taxClassSnapshot === "ZeroRated" && it.vatFils !== 0)
    )
  );
  check(
    "zero-rated lines carry no VAT",
    badZeroRated === undefined,
    badZeroRated?.reference
  );

  const missingSnapshot = orders.find((o) =>
    o.invoices.some((i) =>
      i.items.some((it) => !it.nameSnapshot || !it.skuCodeSnapshot || !it.taxClassSnapshot)
    )
  );
  check(
    "every order line snapshots its name, SKU and tax class",
    missingSnapshot === undefined,
    missingSnapshot?.reference
  );

  const noRate = orders.find((o) => !o.vatRateBasisPoints);
  check("every order records the VAT rate in force when placed", noRate === undefined);

  const refs = orders.map((o) => o.reference);
  check("order references are unique", new Set(refs).size === refs.length);

  console.log(`\n  ${orders.length} order(s) checked`);
}

/* ---------- summary ---------- */

await prisma.$disconnect();

if (failures > 0) {
  console.log(`\n${failures} check(s) failed\n`);
  process.exit(1);
}
console.log("\nDatabase matches the catalogue\n");
