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

// Fake, but plausible for a UAE medical-supplies wholesaler. Every entry is
// marked isPlaceholder so it can be deleted in one query once the real
// catalogue arrives. [name, brand, categoryId, priceAED, unit, packSize, tiers]
const PLACEHOLDERS = [
  ["Nitrile Examination Gloves Powder Free Medium", "Medisafe", 81, 34.5, "Box", "100 pack", [[10, 32.9], [50, 30.5]]],
  ["Nitrile Examination Gloves Powder Free Large", "Medisafe", 81, 34.5, "Box", "100 pack", [[10, 32.9], [50, 30.5]]],
  ["Latex Examination Gloves Powder Free Small", "Medisafe", 81, 28.9, "Box", "100 pack", [[10, 27.5]]],
  ["Type IIR Surgical Face Mask Level 2", "Medisafe", 79, 18.75, "Box", "50 pack", [[20, 17.25], [100, 15.9]]],
  ["P2/N95 Respirator Flat Fold", "Medisafe", 79, 62.0, "Box", "20 pack", [[10, 58.5]]],
  ["Disposable Isolation Gown AAMI Level 2", "Medisafe", 80, 96.0, "Carton", "50 pack", [[5, 91.0]]],
  ["Bouffant Cap Blue", "Medisafe", 82, 12.4, "Box", "100 pack", []],
  ["Alcohol Hand Rub Gel 70% 500mL Pump", "Puracleanse", 33, 21.9, "Each", "500 mL", [[12, 19.99], [48, 18.5]]],
  ["Antibacterial Hand Wash 5L Refill", "Puracleanse", 33, 78.0, "Each", "5 L", [[4, 73.5]]],
  ["Surface Disinfectant Wipes Canister", "Puracleanse", 140, 32.5, "Each", "200 wipes", [[6, 30.0], [24, 28.4]]],
  ["Hospital Grade Disinfectant Concentrate 5L", "Puracleanse", 147, 112.0, "Each", "5 L", [[4, 105.0]]],
  ["Clinical Waste Bags Yellow 240L", "Puracleanse", 141, 145.0, "Carton", "100 pack", [[5, 138.0]]],
  ["Sterile Gauze Swabs 7.5cm x 7.5cm", "Woundline", 60, 8.9, "Pack", "100 pack", [[25, 8.25], [100, 7.6]]],
  ["Adhesive Wound Dressing 6cm x 7cm", "Woundline", 60, 24.5, "Box", "50 pack", [[10, 22.9]]],
  ["Conforming Bandage 7.5cm x 4m", "Woundline", 60, 4.25, "Each", "", [[50, 3.85]]],
  ["Micropore Surgical Tape 2.5cm x 9m", "Woundline", 152, 3.6, "Each", "", [[24, 3.3], [96, 3.05]]],
  ["Povidone-Iodine Antiseptic Solution 500mL", "Woundline", 61, 27.0, "Each", "500 mL", [[12, 25.5]]],
  ["Alcohol Prep Pads Sterile", "Woundline", 140, 14.9, "Box", "200 pack", [[20, 13.75]]],
  ["Instant Cold Pack Single Use", "Woundline", 59, 6.5, "Each", "", [[24, 5.95]]],
  ["Digital Thermometer Oral and Axillary", "Medcore", 111, 42.0, "Each", "", [[10, 39.5]]],
  ["Infrared Non-Contact Forehead Thermometer", "Medcore", 111, 165.0, "Each", "", [[5, 156.0], [20, 149.0]]],
  ["Fingertip Pulse Oximeter", "Medcore", 114, 118.0, "Each", "", [[5, 112.0]]],
  ["Dual Head Stethoscope Stainless Steel", "Medcore", 109, 138.0, "Each", "", [[5, 129.0]]],
  ["Aneroid Sphygmomanometer with Adult Cuff", "Medcore", 111, 175.0, "Each", "", [[5, 165.0]]],
  ["Diagnostic Penlight Reusable", "Medcore", 111, 22.5, "Each", "", [[20, 20.9]]],
  ["Blood Glucose Test Strips", "Medcore", 114, 89.0, "Box", "50 pack", [[10, 84.0]]],
  ["Disposable Scalpel Blade No.11 Sterile", "Medcore", 105, 46.0, "Box", "100 pack", [[10, 43.5]]],
  ["Iris Scissors Straight 11.5cm", "Medcore", 104, 58.0, "Each", "", [[10, 54.0]]],
  ["Dressing Forceps Serrated 14cm", "Medcore", 115, 39.0, "Each", "", [[10, 36.5]]],
  ["Luer Lock Syringe 10mL Sterile", "Medcore", 49, 38.5, "Box", "100 pack", [[10, 36.0], [50, 34.2]]],
  ["Hypodermic Needle 21G x 38mm", "Medcore", 46, 31.0, "Box", "100 pack", [[10, 29.0]]],
  ["Safety Lancets 28G Single Use", "Medcore", 106, 54.0, "Box", "200 pack", [[10, 50.5]]],
  ["IV Administration Set 20 Drops per mL", "Medcore", 117, 12.9, "Each", "", [[25, 11.9]]],
  ["Nasal Oxygen Cannula Adult", "Medcore", 57, 9.4, "Each", "", [[25, 8.6]]],
  ["Nebuliser Mask Kit Adult", "Medcore", 112, 16.8, "Each", "", [[20, 15.5]]],
  ["Examination Couch Roll 50cm x 50m", "Medisafe", 47, 26.0, "Each", "", [[12, 24.0], [48, 22.5]]],
  ["Kidney Dish Stainless Steel 250mm", "Medcore", 113, 44.0, "Each", "", [[10, 41.0]]],
  ["Sharps Container 5L Yellow", "Medisafe", 141, 33.5, "Each", "5 L", [[12, 31.0]]],
  ["Instrument Sterilisation Pouches 90mm x 230mm", "Medisafe", 37, 42.0, "Box", "200 pack", [[10, 39.5]]],
  ["Autoclave Indicator Tape 19mm", "Medisafe", 37, 11.5, "Each", "", [[24, 10.6]]],
  ["Dental Bibs 2-Ply Blue", "Dentiva", 119, 29.0, "Box", "500 pack", [[10, 27.0]]],
  ["Saliva Ejectors Disposable", "Dentiva", 122, 17.5, "Bag", "100 pack", [[20, 16.2]]],
  ["Prophy Paste Cups Medium Grit", "Dentiva", 120, 68.0, "Box", "200 pack", [[5, 64.0]]],
  ["Alginate Impression Material 500g", "Dentiva", 129, 54.0, "Each", "500 g", [[10, 50.5]]],
  ["Fluoride Varnish Unit Dose 0.4mL", "Dentiva", 134, 185.0, "Box", "50 pack", [[5, 175.0]]],
  ["Specimen Container 70mL Sterile", "Labworks", 72, 48.0, "Box", "100 pack", [[10, 45.0]]],
  ["Microscope Slides Frosted End", "Labworks", 71, 22.0, "Box", "50 pack", [[20, 20.5]]],
  ["Borosilicate Beaker 250mL", "Labworks", 74, 18.9, "Each", "250 mL", [[12, 17.4]]],
  ["Nitrile Lab Gloves Chemical Resistant", "Labworks", 73, 39.5, "Box", "100 pack", [[10, 37.0]]],
  ["Adjustable Volume Micropipette 100-1000uL", "Labworks", 75, 420.0, "Each", "", [[3, 399.0]]],
];

// Suppliers 20 and 21 are the only ones the extraction evidences. The
// placeholder brands get their own ids so that multi-supplier checkout — one
// invoice per supplier — is actually exercisable in the UI.
const SUPPLIER_BY_BRAND = {
  Medisafe: 21,
  Puracleanse: 22,
  Woundline: 23,
  Medcore: 24,
  Dentiva: 25,
  Labworks: 26,
};

// Supplier ids 20 and 21 are real; the names are not — the extraction never
// exposed them. Everything from 22 up is invented alongside the placeholder
// brands. Replace wholesale when the real supplier list arrives.
const SUPPLIERS = [
  { id: 20, name: "Northline Uniforms", isPlaceholder: true },
  { id: 21, name: "AussieMed Distribution", isPlaceholder: true },
  { id: 22, name: "Puracleanse Hygiene", isPlaceholder: true },
  { id: 23, name: "Woundline Medical", isPlaceholder: true },
  { id: 24, name: "Medcore Instruments", isPlaceholder: true },
  { id: 25, name: "Dentiva Dental Supply", isPlaceholder: true },
  { id: 26, name: "Labworks Scientific", isPlaceholder: true },
];

// A handful are deliberately out of stock so the Notify Me path is exercisable.
const OUT_OF_STOCK_NAMES = new Set([
  "P2/N95 Respirator Flat Fold",
  "Infrared Non-Contact Forehead Thermometer",
  "Fluoride Varnish Unit Dose 0.4mL",
]);

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

// --- real products -------------------------------------------------
for (const row of rawProducts) {
  const meta = REAL_PRODUCT_META[row.productMasterId] ?? {};
  const name = tidyName(row.name);
  const basePrice = round2(row.displayPriceAED);

  products.push({
    id: row.productMasterId,
    skuId: row.skuId,
    slug: uniqueSlug(slugify(name)),
    sku: meta.sku ?? `AM-${row.productMasterId}`,
    name,
    brand: meta.brand ?? null,
    description: meta.description ?? null,
    categoryId: meta.categoryId ?? null,
    categoryPath: meta.categoryId ? categoryPath(meta.categoryId) : [],
    priceAED: basePrice,
    unit: row.unit ?? "Each",
    packSize: meta.packSize || null,
    supplierId: row.supplierId,
    outOfStock: Boolean(row.outOfStock),
    // listImage/pdpImages in the source are social icons, the site logo, and a
    // scraped JS template fragment — no product imagery. Discarded entirely.
    images: meta.images ?? [],
    tiers: normaliseTiers(row.tierQty, row.tierPriceAED, basePrice),
    isPlaceholder: false,
    detailKey: row.detailKey ?? null,
    sourceNote: row._note ?? null,
  });
}

// --- placeholders --------------------------------------------------
let nextId = 1000;
for (const [name, brand, categoryId, price, unit, packSize, tiers] of PLACEHOLDERS) {
  const basePrice = round2(price);
  products.push({
    id: nextId,
    skuId: nextId,
    slug: uniqueSlug(slugify(name)),
    sku: `PL-${nextId}`,
    name,
    brand,
    description: `${name}. Placeholder catalogue entry used for layout and filtering during the rebuild — replace with the real product description before launch.`,
    categoryId,
    categoryPath: categoryPath(categoryId),
    priceAED: basePrice,
    unit,
    packSize: packSize || null,
    supplierId: SUPPLIER_BY_BRAND[brand] ?? 21,
    outOfStock: OUT_OF_STOCK_NAMES.has(name),
    images: [],
    // Run placeholder tiers through the same normaliser as the real ones, so
    // a typo in the seed table cannot produce a tier shape the storefront
    // never has to handle for real data.
    tiers: normaliseTiers(
      tiers.map(([minQty]) => minQty),
      tiers.map(([, priceAED]) => priceAED),
      basePrice
    ),
    isPlaceholder: true,
    detailKey: null,
    sourceNote: null,
  });
  nextId += 1;
}

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
