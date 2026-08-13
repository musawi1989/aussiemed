/**
 * Acceptance checks for the catalogue data layer.
 *
 * These encode the rules the old site broke. Run with `npm run check`.
 * They operate on catalog.json directly so they stay fast and dependency-free.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(
  readFileSync(resolve(root, "src/data/catalog.json"), "utf8")
);

let failures = 0;
const check = (name, condition, detail = "") => {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

console.log("\nCatalogue acceptance checks\n");

/* --- currency ---------------------------------------------------- */

const serialised = JSON.stringify(catalog);
check(
  "no Arabic dirham symbol anywhere in the data",
  !serialised.includes("د.إ"),
  "the string د.إ must never appear"
);
check("currency is the English string AED", catalog.currency === "AED");

/* --- money and quantities ---------------------------------------- */

// Compare with a tolerance: 18.9 * 100 is 1889.9999999999998 in binary floating
// point, so an exact equality here would flag valid two-decimal prices.
const hasAtMost2dp = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

const allPrices = catalog.products.flatMap((p) => [
  { name: p.name, value: p.priceAED },
  ...p.tiers.map((t) => ({ name: `${p.name} tier ${t.minQty}+`, value: t.priceAED })),
]);
const badPrice = allPrices.find((entry) => !hasAtMost2dp(entry.value));
check(
  "every price and tier price is at most 2 decimal places",
  badPrice === undefined,
  badPrice && `${badPrice.name} = ${badPrice.value}`
);

const badTierQty = catalog.products
  .flatMap((p) => p.tiers.map((t) => ({ p, t })))
  .find(({ t }) => !Number.isInteger(t.minQty));
check(
  "every tier quantity is an integer",
  badTierQty === undefined,
  badTierQty && `${badTierQty.p.name} minQty=${badTierQty.t.minQty}`
);

/* --- tier pricing integrity --------------------------------------- */

const badTierOrder = catalog.products.find((p) => {
  let prevQty = 1;
  let prevPrice = p.priceAED;
  for (const tier of p.tiers) {
    if (tier.minQty <= prevQty || tier.priceAED >= prevPrice) return true;
    prevQty = tier.minQty;
    prevPrice = tier.priceAED;
  }
  return false;
});
check(
  "tiers ascend by quantity and descend in price",
  badTierOrder === undefined,
  badTierOrder && `${badTierOrder.name}: ${JSON.stringify(badTierOrder.tiers)}`
);

/* --- categories --------------------------------------------------- */

const categoryIds = new Set();
for (const dept of catalog.departments) {
  categoryIds.add(dept.id);
  for (const child of dept.children) categoryIds.add(child.id);
}

// Category slugs address a category in the URL, so two categories sharing one
// means a buyer clicking category A silently lands on category B's products.
// The source repeats names across departments, so this needs asserting.
const allCategories = catalog.departments.flatMap((d) => [d, ...d.children]);
const slugOwners = new Map();
for (const node of allCategories) {
  const owners = slugOwners.get(node.slug) ?? [];
  owners.push(`${node.name} (${node.id})`);
  slugOwners.set(node.slug, owners);
}
const collision = [...slugOwners.entries()].find(([, owners]) => owners.length > 1);
check(
  "category slugs are unique across the whole tree",
  collision === undefined,
  collision && `"${collision[0]}" claimed by ${collision[1].join(" and ")}`
);

const orphan = catalog.products.find(
  (p) => p.categoryId !== null && !categoryIds.has(p.categoryId)
);
check(
  "every product points at a category that exists",
  orphan === undefined,
  orphan && `${orphan.name} -> ${orphan.categoryId}`
);

const uncategorised = catalog.products.filter((p) => !p.categoryId);
check(
  "no product is left uncategorised",
  uncategorised.length === 0,
  `${uncategorised.length} uncategorised`
);

// The rule the old site broke: a category's advertised count must equal the
// number of products a buyer actually sees when they click it.
const recomputed = {};
for (const p of catalog.products) {
  for (const node of p.categoryPath) {
    recomputed[node.id] = (recomputed[node.id] ?? 0) + 1;
  }
}
const mismatch = Object.entries(recomputed).find(
  ([id, count]) => catalog.productCountByCategory[id] !== count
);
check(
  "category counts equal the products they resolve to",
  mismatch === undefined,
  mismatch && `category ${mismatch[0]}: stored ${catalog.productCountByCategory[mismatch[0]]}, actual ${mismatch[1]}`
);

// Every product's breadcrumb must resolve parent-then-child, so a department
// filter returns everything beneath it.
const brokenPath = catalog.products.find(
  (p) => p.categoryId !== null && p.categoryPath.at(-1)?.id !== p.categoryId
);
check(
  "each breadcrumb ends at the product's own category",
  brokenPath === undefined,
  brokenPath && brokenPath.name
);

/* --- identity ----------------------------------------------------- */

const slugs = catalog.products.map((p) => p.slug);
check(
  "product slugs are unique",
  new Set(slugs).size === slugs.length,
  `${slugs.length - new Set(slugs).size} duplicates`
);

const skus = catalog.products.map((p) => p.sku);
check("product SKUs are unique", new Set(skus).size === skus.length);

const badName = catalog.products.find((p) => /&(amp|#x?[0-9a-f]+|quot|lt|gt);/i.test(p.name));
check(
  "no unescaped HTML entities survive in product names",
  badName === undefined,
  badName && badName.name
);

/* --- extraction junk ---------------------------------------------- */

const junkImage = catalog.products.find((p) =>
  p.images.some(
    (src) => src.includes("item.image") || src.includes("icons/") || src.includes("logo")
  )
);
check(
  "no scraped template fragments or site chrome in product images",
  junkImage === undefined,
  junkImage && junkImage.images.join(", ")
);

const absoluteImage = catalog.products.find((p) =>
  p.images.some((src) => /^https?:\/\//i.test(src) || src.includes("~/"))
);
check(
  "all image paths are local and resolved",
  absoluteImage === undefined,
  absoluteImage && absoluteImage.images.join(", ")
);

/* --- summary ------------------------------------------------------ */

const real = catalog.products.filter((p) => !p.isPlaceholder).length;
console.log(
  `\n  ${catalog.products.length} products (${real} real, ${catalog.products.length - real} placeholder), ` +
    `${categoryIds.size} categories in ${catalog.departments.length} departments`
);

if (failures > 0) {
  console.log(`\n${failures} check(s) failed\n`);
  process.exit(1);
}
console.log("\nAll checks passed\n");
