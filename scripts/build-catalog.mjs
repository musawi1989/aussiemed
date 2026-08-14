/**
 * Builds src/data/catalog.json from the extraction mirror.
 *
 * This is a one-way transform: extraction/data/*.json is read-only reference
 * material. Re-run with `node scripts/build-catalog.mjs` after editing seeds.
 *
 * What it does:
 *  1. Rebuilds the two-level category tree that the flat extract lost.
 *  2. Cleans the 11 real products (HTML entities, junk images, broken tiers).
 *  3. Adds placeholder products so list density, filtering and pagination are
 *     designable. Every one is flagged isPlaceholder: true.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUPPLIER_IDS,
  TEST_PRODUCTS,
  TEST_SUPPLIERS,
} from "./seed-catalogue.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

/* ------------------------------------------------------------------ *
 * 1. Categories
 * ------------------------------------------------------------------ */

// The extract is flat, but ordering preserves the hierarchy: each of these ids
// is a top-level department, and every category listed after it (until the next
// department) is one of its children.
const DEPARTMENT_IDS = new Set([15, 16, 17, 18, 19, 20, 24, 25, 26, 27, 28]);

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function buildCategoryTree(flat) {
  const departments = [];
  let current = null;

  for (const row of flat) {
    const node = { id: row.id, name: row.name, slug: slugify(row.name) };
    if (DEPARTMENT_IDS.has(row.id)) {
      current = { ...node, children: [] };
      departments.push(current);
    } else if (current) {
      current.children.push({ ...node, parentId: current.id });
    }
  }

  // Category slugs must be unique across the WHOLE tree, not just between
  // siblings. The source repeats names both within a department ("Oral Care"
  // twice under Beauty) and across departments ("Monitoring & Testing" under
  // both Medical Consumables and Instruments & Diagnostics; likewise
  // Dispensers, Bags, Medicine, Respiratory Management, Wound Care).
  //
  // Deduping only among siblings leaves two categories sharing a slug, so one
  // becomes unreachable and the other answers to the wrong name — the same
  // shape of bug as the original site's broken category links. First
  // occurrence in source order keeps the clean slug; later ones take the id.
  const takenSlugs = new Set();
  const claim = (node) => {
    if (takenSlugs.has(node.slug)) node.slug = `${node.slug}-${node.id}`;
    takenSlugs.add(node.slug);
  };

  for (const dept of departments) {
    claim(dept);
    for (const child of dept.children) claim(child);
  }

  return departments;
}

/* ------------------------------------------------------------------ *
 * 2. Cleaning helpers
 * ------------------------------------------------------------------ */

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#x2B;/gi, "+")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Title-cases names that were entered in all-lowercase, leaving already-cased
// names (and acronyms/model numbers) alone.
const tidyName = (s) => {
  const clean = decodeEntities(s);
  if (clean !== clean.toLowerCase()) return clean;
  return clean.replace(/\b[a-z]/g, (c) => c.toUpperCase());
};

/**
 * The source stores tiers as two parallel arrays, zero-padded, and supplier 21
 * entered thresholds descending with tier 1 repeating the base price. Only
 * supplier 20's product 183 ([1,5,10] -> [100,95,90]) shows the intended shape:
 * qty >= threshold gets the price.
 *
 * So: pair them up, drop empty rows, sort ascending by quantity, and keep only
 * rows that are a genuine discount on the base price and on the tier before.
 */
function normaliseTiers(tierQty, tierPrice, basePrice) {
  if (!Array.isArray(tierQty) || !Array.isArray(tierPrice)) return [];

  const pairs = tierQty
    .map((qty, i) => ({ minQty: Math.round(qty), priceAED: tierPrice[i] }))
    .filter((t) => t.minQty > 1 && t.priceAED > 0 && t.priceAED < basePrice)
    .sort((a, b) => a.minQty - b.minQty);

  const kept = [];
  let floor = basePrice;
  for (const tier of pairs) {
    if (tier.priceAED >= floor) continue; // must beat the previous break
    kept.push({ minQty: tier.minQty, priceAED: round2(tier.priceAED) });
    floor = tier.priceAED;
  }
  return kept;
}

const round2 = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ *
 * Packs, tax and specs
 *
 * Modelled on how trade medical suppliers actually sell: the same line is
 * bought by the box or by the carton at different prices, so the pack is the
 * purchasable thing, not the product.
 * ------------------------------------------------------------------ */

/**
 * Builds the pack list for a product. Where a base pack has an obvious outer
 * (a box that comes 10 to a carton), the carton is generated at a discount,
 * because buying an outer is always cheaper per unit than buying its contents
 * separately — that is the entire reason a trade buyer orders one.
 */
function buildPacks(sku, unit, packSize, basePrice, tiers, outOfStock, outer) {
  const base = {
    id: "base",
    sku,
    label: packSize ? `${packSize.replace(/\bpack\b/i, "Pieces")}/${unit}` : unit,
    shortLabel: unit,
    eachesPerPack: 1,
    priceAED: round2(basePrice),
    tiers,
    outOfStock,
  };

  if (!outer) return [base];

  const [perOuter, outerName] = outer;
  // Buying the outer earns a further discount on top of the best unit tier.
  const bestUnit = tiers.length ? tiers[tiers.length - 1].priceAED : basePrice;
  const outerPrice = round2(bestUnit * perOuter * 0.97);

  return [
    base,
    {
      id: "outer",
      sku: `${sku}-${perOuter}`,
      label: `${perOuter} ${unit}${perOuter > 1 ? "es" : ""}/${outerName}`
        .replace("Boxes/", "Boxes/")
        .replace("Eaches/", "Each/"),
      shortLabel: outerName,
      eachesPerPack: perOuter,
      priceAED: outerPrice,
      tiers: [
        { minQty: 4, priceAED: round2(outerPrice * 0.97) },
        { minQty: 10, priceAED: round2(outerPrice * 0.94) },
      ],
      outOfStock,
    },
  ];
}

/**
 * VAT treatment. In the UAE a defined list of medical equipment and supplies is
 * zero-rated rather than standard-rated at 5%. These assignments are OUR
 * reading of the product names and must be confirmed by the client's tax
 * adviser before launch — getting this wrong misstates a tax document.
 */
const ZERO_RATED_PATTERNS = [
  /glove/i,
  /face mask|respirator|surgical mask/i,
  /gown|bouffant/i,
  /syringe|needle|lancet|cannula/i,
  /gauze|dressing|bandage|suture/i,
  /catheter|incontinence|pads extra/i,
  /thermometer|oximeter|sphygmomanometer|stethoscope|blood pressure/i,
];

const taxClassFor = (name) =>
  ZERO_RATED_PATTERNS.some((re) => re.test(name)) ? "zero-rated" : "standard";

/* ------------------------------------------------------------------ *
 * 3. The 11 real products — enrichment the extract could not carry
 * ------------------------------------------------------------------ */

// The source has no category link, no brand, and no description on any product.
// These mappings are ours, derived from the product names.
const REAL_PRODUCT_META = {
  171: {
    brand: "Omron",
    categoryId: 111,
    sku: "OMR-HEM7156T",
    description:
      "Upper-arm automatic blood pressure monitor with cuff wrapping guide and irregular heartbeat detection. Suitable for clinical and home monitoring use, with a single-button operation and a wide-range cuff.",
  },
  172: {
    brand: "TENA",
    categoryId: 51,
    sku: "TEN-PAD-EX24",
    packSize: "24 pack",
    description:
      "Extra absorbency incontinence pads in standard length, with a rapid-absorption core and body-close fit. Supplied 24 per pack for residential and aged-care use.",
  },
  173: {
    brand: "Kleenex",
    categoryId: 138,
    sku: "KLX-AV95",
    packSize: "95 pack",
    description:
      "Facial tissues with aloe vera and vitamin E, designed to be gentle on sensitive skin. Two-ply, 95 tissues per box, suitable for reception areas and consulting rooms.",
  },
  174: {
    brand: "Swisspers",
    categoryId: 94,
    sku: "SWP-CT240",
    packSize: "240 pack",
    description:
      "Cotton tips on biodegradable paper stems, with firmly wound tips at both ends. Supplied 240 per pack for general clinical and personal care use.",
  },
  175: {
    brand: "FESS",
    categoryId: 42,
    sku: "FES-NS75",
    packSize: "75 mL",
    description:
      "Preservative-free saline nasal spray for relief of nasal congestion and dryness. Non-medicated and suitable for frequent use, in a 75 mL metered spray bottle.",
  },
  176: {
    brand: "Cancer Council",
    categoryId: 63,
    sku: "CCL-SPF50-110",
    packSize: "110 mL",
    description:
      "Broad-spectrum SPF 50+ sunscreen for everyday use, water resistant for four hours. Suitable for workplace sun-safety programmes and outdoor staff, in a 110 mL pump bottle.",
  },
  177: {
    brand: "Manicare",
    categoryId: 84,
    sku: "MAN-NC-FILE",
    description:
      "Stainless steel nail clippers with a built-in nail file and lever action. Suitable for personal care, podiatry support and general clinic amenity use.",
  },
  178: {
    brand: "Bodichek",
    categoryId: 64,
    sku: "BDC-FAK126",
    packSize: "126 pieces",
    description:
      "General purpose first aid kit containing 126 pieces in a compartmented carry case, covering wound dressing, strapping and basic emergency response for small workplaces.",
  },
  179: {
    brand: "Vicks",
    categoryId: 41,
    sku: "VCK-VR100",
    packSize: "100 g",
    description:
      "Topical chest rub ointment with camphor, eucalyptus and menthol for temporary relief of coughs and nasal congestion. 100 g jar for ward and residential use.",
  },
  180: {
    brand: "Vaseline",
    categoryId: 98,
    sku: "VAS-PJ100",
    packSize: "100 g",
    description:
      "Triple-purified petroleum jelly for protection of dry, chafed or cracked skin, and as a barrier over minor wounds. 100 g jar.",
  },
  183: {
    brand: "AussieMed",
    categoryId: 80,
    sku: "AMD-SCRUB-M",
    description:
      "Men's scrub top in a soft poly-cotton blend, with a V-neck, chest pocket and side vents. Available in a range of sizes and colourways for clinical teams.",
    // The extraction held three photographs for this product. Two are genuine
    // scrub tops; the third (k3f2xffd.jpg, saved as scrub-top-1.jpg) is a stock
    // photo of a pocket watch that someone uploaded against the wrong product.
    // It is excluded rather than shown as the hero image — the file is still in
    // public/products/ if it turns out to belong somewhere.
    images: ["/products/scrub-top-2.jpeg", "/products/scrub-top-3.jpeg"],
  },
};

/* ------------------------------------------------------------------ *
 * 4. Placeholder catalogue
 * ------------------------------------------------------------------ */

// Products come from scripts/seed-catalogue.mjs — real items seeded from two
// public supplier catalogues for testing. See DA-01 in the issue register.

// Merchandising and packaging rules are matched on what a product IS, not on
// an exact name, so they keep working when the catalogue is replaced.

/** Lines that also sell by the outer. [units per outer, outer name]. */
const OUTER_RULES = [
  [/\bglove/i, [10, "Carton"]],
  [/mask|respirator/i, [20, "Carton"]],
  [/gauze|swab|dressing|bandage/i, [25, "Carton"]],
  [/tape\b/i, [24, "Carton"]],
  [/sanitiser|sanitizer|hand rub|hand wash/i, [12, "Carton"]],
  [/wipe|tissue/i, [6, "Carton"]],
  [/syringe|needle|lancet/i, [10, "Carton"]],
  [/bib|specimen/i, [10, "Carton"]],
];
const outerFor = (name) => OUTER_RULES.find(([re]) => re.test(name))?.[1];

/** Sizes a buyer can see even when only one is stocked. */
const SIZE_AXIS = (current) => ({
  name: "Size",
  selected: current,
  options: ["Extra Small", "Small", "Medium", "Large", "Extra Large"].map(
    (value) => ({ value, available: value !== "Extra Small" })
  ),
});

/** Reads the size out of the product name so the axis reflects reality. */
function variantsFor(name) {
  if (!/\bglove|gown|scrub|apron/i.test(name)) return [];
  const m = /\b(extra small|x-?small|small|medium|large|extra large|x-?large)\b/i.exec(name);
  const found = m
    ? m[1]
        .toLowerCase()
        .replace(/^x-?/, "extra ")
        // Title-case each word so the value matches an option chip exactly.
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "Medium";
  const axes = [SIZE_AXIS(found)];
  if (/\bglove/i.test(name)) {
    axes.push({
      name: "Colour",
      selected: /black/i.test(name) ? "Black" : /green/i.test(name) ? "Green" : "Blue",
      options: [
        { value: "Blue", available: true },
        { value: "Black", available: true },
        { value: "Green", available: false },
      ],
    });
  }
  return axes;
}

/**
 * Merchandising flags. Real ones come from sales data; these are derived so
 * the badge treatments stay reviewable against any catalogue.
 */
function badgesFor(name, index) {
  const badges = [];
  if (/\bglove|sanitiser|gauze|mask/i.test(name) && index % 7 === 0) badges.push("top-seller");
  if (index % 11 === 3) badges.push("new");
  if (index % 13 === 5) badges.push("back-soon");
  return badges;
}

const isOutOfStock = (name, index) => index % 13 === 5 || /discontinued/i.test(name);

/**
 * Supplier ids 20 and 21 come from the extraction; their names are ours, since
 * the extraction never exposed them. 30 and 31 are the two test suppliers whose
 * public catalogues seeded the products.
 */
const SUPPLIERS = [
  { id: 20, name: "Northline Uniforms", isPlaceholder: true },
  { id: 21, name: "AussieMed Distribution", isPlaceholder: true },
  ...TEST_SUPPLIERS,
];

/** Structured specs. Filterable later; for now they render as a details table. */
function buildAttributes({ brand, unit, packSize, categoryPath, taxClass, supplierName }) {
  const rows = [];
  if (brand) rows.push({ label: "Brand", value: brand });
  rows.push({ label: "Unit", value: unit });
  if (packSize) rows.push({ label: "Pack size", value: packSize });
  const category = categoryPath.at(-1)?.name;
  if (category) rows.push({ label: "Category", value: category });
  if (supplierName) rows.push({ label: "Supplier", value: supplierName });
  rows.push({
    label: "VAT treatment",
    value: taxClass === "zero-rated" ? "Zero-rated" : "Standard rated (5%)",
  });
  return rows;
}

/* ------------------------------------------------------------------ *
 * 5. Build
 * ------------------------------------------------------------------ */

const rawCategories = read("extraction/data/categories.json");
const rawProducts = read("extraction/data/products.json");

const departments = buildCategoryTree(rawCategories);

const categoryIndex = new Map();
for (const dept of departments) {
  categoryIndex.set(dept.id, { ...dept, parentId: null });
  for (const child of dept.children) categoryIndex.set(child.id, child);
}

const categoryPath = (id) => {
  const node = categoryIndex.get(id);
  if (!node) return [];
  const parent = node.parentId ? categoryIndex.get(node.parentId) : null;
  return parent
    ? [
        { id: parent.id, name: parent.name, slug: parent.slug },
        { id: node.id, name: node.name, slug: node.slug },
      ]
    : [{ id: node.id, name: node.name, slug: node.slug }];
};

const usedSlugs = new Set();
const uniqueSlug = (base) => {
  let slug = base;
  let n = 2;
  while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
  usedSlugs.add(slug);
  return slug;
};

const products = [];

const supplierName = (id) => SUPPLIERS.find((s) => s.id === id)?.name ?? null;

/** Assembles the shared shape so real and placeholder products cannot drift. */
function buildProduct({
  id, skuId, sku, name, brand, description, categoryId, basePrice, unit,
  packSize, supplierId, outOfStock, images, tiers, isPlaceholder,
  detailKey = null, sourceNote = null, index = 0,
}) {
  const path = categoryId ? categoryPath(categoryId) : [];
  const taxClass = taxClassFor(name);
  const packs = buildPacks(
    sku, unit, packSize, basePrice, tiers, outOfStock, outerFor(name)
  );

  return {
    id,
    skuId,
    slug: uniqueSlug(slugify(name)),
    sku,
    name,
    brand: brand ?? null,
    description: description ?? null,
    categoryId: categoryId ?? null,
    categoryPath: path,
    // Mirrors the default pack so listings need not resolve packs to show a
    // price. check-catalog.mjs asserts the two never diverge.
    priceAED: basePrice,
    unit,
    packSize: packSize || null,
    supplierId,
    outOfStock,
    images,
    tiers,
    taxClass,
    packs,
    defaultPackId: packs[0].id,
    variants: variantsFor(name),
    attributes: buildAttributes({
      brand,
      unit,
      packSize,
      categoryPath: path,
      taxClass,
      supplierName: supplierName(supplierId),
    }),
    // No real SDS or spec sheets were supplied. The field exists because
    // medical and laboratory buyers expect them, and often need them.
    documents: [],
    badges: badgesFor(name, index),
    isPlaceholder,
    detailKey,
    sourceNote,
  };
}

// --- real products -------------------------------------------------
for (const row of rawProducts) {
  const meta = REAL_PRODUCT_META[row.productMasterId] ?? {};
  const name = tidyName(row.name);
  const basePrice = round2(row.displayPriceAED);

  products.push(
    buildProduct({
      id: row.productMasterId,
      skuId: row.skuId,
      sku: meta.sku ?? `AM-${row.productMasterId}`,
      name,
      brand: meta.brand,
      description: meta.description,
      categoryId: meta.categoryId,
      basePrice,
      unit: row.unit ?? "Each",
      packSize: meta.packSize,
      supplierId: row.supplierId,
      outOfStock: Boolean(row.outOfStock),
      // listImage/pdpImages in the source are social icons, the site logo, and
      // a scraped JS template fragment — no imagery. Discarded entirely.
      images: meta.images ?? [],
      tiers: normaliseTiers(row.tierQty, row.tierPriceAED, basePrice),
      isPlaceholder: false,
      detailKey: row.detailKey ?? null,
      sourceNote: row._note ?? null,
    })
  );
}

// --- test catalogue ------------------------------------------------
// Sixty real products seeded from two public supplier catalogues, so the
// storefront can be judged against things that actually exist. Flagged
// isPlaceholder because they are not AussieMed's own range.
let nextId = 1000;
TEST_PRODUCTS.forEach((seed, index) => {
  const basePrice = round2(seed.priceAED);
  products.push(
    buildProduct({
      id: nextId,
      skuId: nextId,
      // Keep the supplier's own item code where they publish one — it makes
      // the seed traceable back to source.
      sku: seed.sourceSku || `TS-${nextId}`,
      name: seed.name,
      brand: seed.brand,
      // Written here rather than copied from the supplier's own listing.
      description: `${seed.name}. Seeded from ${seed.supplier}'s public catalogue for testing — description and specification to be replaced with approved copy before launch.`,
      categoryId: seed.categoryId,
      basePrice,
      unit: seed.unit,
      packSize: seed.packSize,
      supplierId: SUPPLIER_IDS[seed.supplier] ?? 21,
      outOfStock: isOutOfStock(seed.name, index),
      // No supplier imagery is copied.
      images: [],
      // Run seeded tiers through the same normaliser as the real ones, so a
      // typo cannot produce a tier shape the storefront never has to handle.
      tiers: normaliseTiers(
        seed.tiers.map(([minQty]) => minQty),
        seed.tiers.map(([, priceAED]) => priceAED),
        basePrice
      ),
      isPlaceholder: true,
      index,
      sourceNote: `Seeded from ${seed.supplier} at AUD ${seed.sourcePriceAUD}, converted for testing.`,
    })
  );
  nextId += 1;
});

/* ------------------------------------------------------------------ *
 * 6. Emit
 * ------------------------------------------------------------------ */

// Counts are derived from the product list itself, never stored separately —
// admin and storefront counts cannot drift apart if there is only one source.
const productCountByCategory = {};
for (const p of products) {
  for (const node of p.categoryPath) {
    productCountByCategory[node.id] = (productCountByCategory[node.id] ?? 0) + 1;
  }
}

const catalog = {
  generatedFrom: "extraction/data (read-only mirror)",
  currency: "AED",
  vatRate: 0.05,
  departments,
  suppliers: SUPPLIERS,
  products,
  productCountByCategory,
};

const outPath = resolve(root, "src/data/catalog.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

const real = products.filter((p) => !p.isPlaceholder).length;
const placeholder = products.length - real;
const uncategorised = products.filter((p) => !p.categoryId).length;
const withTiers = products.filter((p) => p.tiers.length > 0).length;

console.log(`catalog.json written`);
console.log(`  departments      ${departments.length}`);
console.log(`  categories       ${categoryIndex.size}`);
console.log(`  products         ${products.length} (${real} real, ${placeholder} placeholder)`);
console.log(`  with tiers       ${withTiers}`);
console.log(`  out of stock     ${products.filter((p) => p.outOfStock).length}`);
if (uncategorised) console.log(`  UNCATEGORISED    ${uncategorised}`);
