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
import { SAMPLE_SKU_PREFIX, SAMPLE_SLUG_PREFIX } from "../src/lib/sample-products.ts";

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

/**
 * Categories are NOT compared against the catalogue JSON.
 *
 * They were, and it was wrong the moment they became editable. The JSON is
 * generated from the read-only extraction mirror, so it records the taxonomy
 * as imported once — and every legitimate edit since then reads as drift. An
 * admin who removes an empty category or adds a missing one is not breaking
 * anything, and a check that goes red when they do is a check people learn to
 * ignore.
 *
 * What is checked instead is that the tree itself holds together: no category
 * points at a parent that does not exist, no two share a slug, and the tree
 * stays two deep. Those are the things that actually break a storefront, and
 * unlike a count they are true regardless of who edited what. Recorded as
 * DA-27.
 */
const categories = await prisma.category.findMany({
  select: { id: true, slug: true, parentId: true, name: true },
});
const ids = new Set(categories.map((c) => c.id));

const orphans = categories.filter((c) => c.parentId && !ids.has(c.parentId));
check(
  "every category's parent exists",
  orphans.length === 0,
  `${orphans.length} orphaned: ${orphans.map((c) => c.name).join(", ")}`
);

const slugs = categories.map((c) => c.slug);
const duplicateSlugs = slugs.filter((s, i) => slugs.indexOf(s) !== i);
check(
  "no two categories share a slug",
  duplicateSlugs.length === 0,
  // A shared slug makes one of them unreachable and the other answer to the
  // wrong name — the defect the @unique on the column was added for.
  `duplicated: ${[...new Set(duplicateSlugs)].join(", ")}`
);

/**
 * Three levels, since 19 Aug. Dental carries Henry Schein's taxonomy, which is
 * genuinely three deep — Dental > Endodontics > Hand Files — and the client
 * asked for it under one department (DA-41). Everything else is two.
 *
 * A fourth level is still checked, because nothing renders one: the filter
 * sidebar, the Browse menu and the breadcrumb all stop at three, so a category
 * four deep would be reachable only by URL and invisible everywhere else.
 */
const byId = new Map(categories.map((c) => [c.id, c]));
const depthOf = (category: (typeof categories)[number]): number => {
  let depth = 0;
  let current = category;
  while (current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    current = parent;
    depth += 1;
  }
  return depth;
};
const tooDeep = categories.filter((c) => depthOf(c) > 2);
check(
  "the category tree is no more than three levels deep",
  tooDeep.length === 0,
  `${tooDeep.length} sit four levels down: ${tooDeep.map((c) => c.name).join(", ")}`
);

/**
 * Sample products are excluded from every comparison below, not counted as
 * drift.
 *
 * They are generated against the database's own category tree rather than
 * emitted into catalog.json (DA-33), so counting them here would report 750
 * failures for as long as they exist — which is exactly the trap DA-27 dug the
 * project out of. They are reported instead, so nobody can lose track of the
 * fact that most of the catalogue is invented.
 */
const notSample = { NOT: { slug: { startsWith: SAMPLE_SLUG_PREFIX } } };
const notSampleSku = { NOT: { skuCode: { startsWith: SAMPLE_SKU_PREFIX } } };

const sampleProducts = await prisma.productMaster.count({
  where: { slug: { startsWith: SAMPLE_SLUG_PREFIX }, status: "Active" },
});
if (sampleProducts > 0) {
  console.log(
    `  NOTE  ${sampleProducts} sample product(s) present and excluded from these checks.`
  );
  console.log("        Remove with: npm run db:seed:samples -- --remove\n");
}

// Active only: retired products stay in the table because orders reference them.
const realProducts = await prisma.productMaster.count({
  where: { status: "Active", ...notSample },
});
check(
  "product count matches the catalogue",
  realProducts === catalog.products.length,
  `db=${realProducts} json=${catalog.products.length}`
);

const expectedSkus = catalog.products.reduce(
  (n: number, p: any) => n + p.packs.length,
  0
);
// Active only: retired SKUs stay in the table because orders reference them.
const realSkus = await prisma.productSku.count({
  where: { isActive: true, ...notSampleSku },
});
check(
  "every pack became a SKU",
  realSkus === expectedSkus,
  `db=${realSkus} json=${expectedSkus}`
);

/**
 * Suppliers who can actually supply something live.
 *
 * Counted through ProductSupply now that a product is not owned by a supplier.
 * Comparing against every Active supplier made this fail the moment one was
 * onboarded before their products were approved, which is the normal order of
 * events rather than a fault. A retired supplier stays in the table regardless,
 * because purchase orders raised with them still name them.
 */
const suppliersInCatalogue = await prisma.supplier.count({
  where: {
    status: "Active",
    supplies: { some: { sku: { product: { status: "Active" } } } },
  },
});

check(
  "every catalogue supplier is in the database",
  suppliersInCatalogue === catalog.suppliers.length,
  `db=${suppliersInCatalogue} json=${catalog.suppliers.length}`
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

// Active only. A retired product loses its category links, because the seed
// rebuilds those from the catalogue and a retired product is no longer in it.
// Nothing browses a retired product, and its order lines carry their own
// snapshot of name, SKU and tax class, so the links are not needed.
const productsWithoutCategory = await prisma.productMaster.count({
  where: { status: "Active", categories: { none: {} } },
});
check(
  "no product is left uncategorised",
  productsWithoutCategory === 0,
  `${productsWithoutCategory} uncategorised`
);

/**
 * isAvailable is derived from supplyStatus and must never be written alone.
 *
 * It stays a column because the daily buying run and nine other places read
 * it, and a boolean filter is far clearer than one unpacking a string. The
 * risk of two fields for one fact is that they drift — and this drift is
 * invisible: a row reading "discontinued" that the buying run happily orders
 * from shows nothing wrong on any screen. So it is asserted instead of hoped
 * for. Every write goes through src/lib/supply-state.ts.
 */
const supplies = await prisma.productSupply.findMany({
  select: {
    isAvailable: true,
    supplyStatus: true,
    sku: { select: { skuCode: true } },
  },
});
const disagreeing = supplies.filter(
  (s) => s.isAvailable !== (s.supplyStatus === "Available")
);
check(
  "supply availability agrees with the supply status",
  disagreeing.length === 0,
  `${disagreeing.length} disagree: ${disagreeing
    .slice(0, 5)
    .map((s) => `${s.sku.skuCode} (${s.supplyStatus}, available=${s.isAvailable})`)
    .join("; ")}`
);

// An alternative on a line the supplier says they can supply is stale advice,
// and reads as "buy this instead" beside an item that is perfectly orderable.
const staleAlternatives = await prisma.productSupply.count({
  where: { supplyStatus: "Available", alternativeSkuId: { not: null } },
});
check(
  "no replacement is suggested against an item that can be supplied",
  staleAlternatives === 0,
  `${staleAlternatives} stale`
);

const rootCategories = categories.filter((c) => c.parentId === null).length;
check(
  // Not a comparison against the import, for the reason above — only that a
  // storefront with nothing to browse would be noticed.
  "there is at least one department to browse",
  rootCategories > 0,
  `${rootCategories} departments`
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
  where: { taxClass: "ZeroRated", status: "Active", ...notSample },
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
const orders = await prisma.order.findMany({ include: { items: true } });

if (orders.length === 0) {
  console.log("  SKIP  no orders placed yet");
} else {
  /*
   * The invoice-split assertions were removed on 16 Aug 2026 along with
   * OrderSupplierInvoice. They checked that an order carried exactly one
   * invoice per supplier and that those invoices summed to the order — real
   * invariants for a marketplace, and meaningless now that AussieMed sells and
   * invoices in its own name (DEC-22).
   *
   * What replaced them is stricter, not weaker: the money now has to add up
   * from the lines themselves, with no intermediate document to hide a
   * rounding difference in.
   */
  const badSubtotal = orders.find(
    (o) => o.items.reduce((n, i) => n + i.lineTotalFils, 0) !== o.subtotalFils
  );
  check(
    "order lines sum to the order subtotal",
    badSubtotal === undefined,
    badSubtotal?.reference
  );

  const badVat = orders.find(
    (o) => o.items.reduce((n, i) => n + i.vatFils, 0) !== o.vatFils
  );
  check(
    "line VAT sums to the order VAT, with no rounding drift",
    badVat === undefined,
    badVat?.reference
  );

  const badTotal = orders.find(
    (o) => o.subtotalFils + o.vatFils !== o.totalFils
  );
  check("order total equals subtotal plus VAT", badTotal === undefined, badTotal?.reference);

  const badLines = orders.find((o) =>
    o.items.some(
      (it) =>
        it.qty < 1 ||
        it.lineTotalFils !== it.unitPriceFils * it.qty ||
        !Number.isInteger(it.vatFils)
    )
  );
  check(
    "every order line is a whole quantity priced in whole fils",
    badLines === undefined,
    badLines?.reference
  );

  // A zero-rated line must carry no VAT, however the rate later changes.
  const badZeroRated = orders.find((o) =>
    o.items.some((it) => it.taxClassSnapshot === "ZeroRated" && it.vatFils !== 0)
  );
  check(
    "zero-rated lines carry no VAT",
    badZeroRated === undefined,
    badZeroRated?.reference
  );

  const missingSnapshot = orders.find((o) =>
    o.items.some(
      (it) => !it.nameSnapshot || !it.skuCodeSnapshot || !it.taxClassSnapshot
    )
  );
  check(
    "every order line snapshots its name, SKU and tax class",
    missingSnapshot === undefined,
    missingSnapshot?.reference
  );

  /* Allocations must never promise more of a line than was ordered — the
     guard on the cross-dock model's central record. */
  const overAllocated = await prisma.orderItem.findMany({
    include: { allocations: { select: { qty: true } } },
  });
  const badAllocation = overAllocated.find(
    (item) => item.allocations.reduce((n, a) => n + a.qty, 0) > item.qty
  );
  check(
    "no order line is allocated more units than were ordered",
    badAllocation === undefined,
    badAllocation?.skuCodeSnapshot
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
