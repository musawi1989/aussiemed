/**
 * Acceptance checks for the catalogue data layer.
 *
 * These encode the rules the old site broke. Run with `npm run check`.
 * They operate on catalog.json directly so they stay fast and dependency-free.
 */

import { existsSync, readFileSync } from "node:fs";
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

/* --- variant integrity --------------------------------------------- */

// A selected value that matches no option leaves every chip unhighlighted, so
// the page silently shows the wrong thing. This also catches the generator
// emitting a raw, uncapitalised value.
const badVariant = catalog.products
  .flatMap((p) => p.variants.map((axis) => ({ p, axis })))
  .find(({ axis }) => !axis.options.some((o) => o.value === axis.selected));
check(
  "every variant's selected value matches one of its options",
  badVariant === undefined,
  badVariant &&
    `${badVariant.p.name}: ${badVariant.axis.name} selected "${badVariant.axis.selected}"`
);

/* --- packs and VAT ------------------------------------------------ */

const badTax = catalog.products.find(
  (p) => !["standard", "zero-rated"].includes(p.taxClass)
);
check(
  "every product has a valid VAT treatment",
  badTax === undefined,
  badTax && `${badTax.name} -> ${badTax.taxClass}`
);

const noPack = catalog.products.find((p) => !p.packs || p.packs.length === 0);
check(
  "every product has at least one purchasable pack",
  noPack === undefined,
  noPack && noPack.name
);

const badDefault = catalog.products.find(
  (p) => !p.packs.some((pack) => pack.id === p.defaultPackId)
);
check(
  "the default pack exists on every product",
  badDefault === undefined,
  badDefault && `${badDefault.name} -> ${badDefault.defaultPackId}`
);

// The listing price is mirrored from the default pack for speed. If the two
// drift, a card advertises one price and the buy box charges another.
const priceDrift = catalog.products.find((p) => {
  const def = p.packs.find((pack) => pack.id === p.defaultPackId);
  return !def || def.priceAED !== p.priceAED;
});
check(
  "listing price matches the default pack price",
  priceDrift === undefined,
  priceDrift && priceDrift.name
);

const dupPackSku = catalog.products.find((p) => {
  const skus = p.packs.map((pack) => pack.sku);
  return new Set(skus).size !== skus.length;
});
check(
  "pack SKUs are unique within a product",
  dupPackSku === undefined,
  dupPackSku && dupPackSku.name
);

// An outer that is not cheaper per unit than its contents has no reason to
// exist, and a trade buyer will notice immediately.
const badOuter = catalog.products
  .filter((p) => p.packs.length > 1)
  .find((p) => {
    const [base, outer] = p.packs;
    const bestBase = base.tiers.length
      ? base.tiers[base.tiers.length - 1].priceAED
      : base.priceAED;
    return outer.priceAED / outer.eachesPerPack >= bestBase;
  });
check(
  "buying the outer beats buying its contents separately",
  badOuter === undefined,
  badOuter && badOuter.name
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

// A path that points at nothing renders as a broken image in production, and
// Next's image optimiser fails the request rather than falling back.
const referencedImages = catalog.products.flatMap((p) =>
  p.images.map((src) => ({ p, src }))
);

const brokenImage = referencedImages.find(
  ({ src }) => !existsSync(resolve(root, "public", `.${src}`))
);
check(
  "every referenced image file exists on disk",
  brokenImage === undefined,
  brokenImage && `${brokenImage.p.name} -> ${brokenImage.src}`
);

/**
 * Existing is not enough: four files in the seed set were SVG placeholders
 * saved with a .jpg extension. They passed the check above and then failed in
 * the browser, because the image optimiser rejects them with a 400 — and a
 * rejected image shows as broken rather than falling back to the monogram
 * tile, so those products looked worse than the ones with no image at all.
 *
 * Sniff the magic bytes instead of trusting the extension.
 */
const IMAGE_MAGIC = [
  { name: "jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 },
  { name: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 },
  { name: "gif", test: (b) => b.subarray(0, 3).toString("latin1") === "GIF" },
  { name: "webp", test: (b) => b.subarray(8, 12).toString("latin1") === "WEBP" },
];

const notAnImage = referencedImages.find(({ src }) => {
  const file = resolve(root, "public", `.${src}`);
  if (!existsSync(file)) return false; // already reported above
  const head = readFileSync(file).subarray(0, 16);
  return !IMAGE_MAGIC.some((m) => m.test(head));
});
check(
  "every referenced image is actually an image, not markup with an image name",
  notAnImage === undefined,
  notAnImage && `${notAnImage.p.name} -> ${notAnImage.src}`
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
