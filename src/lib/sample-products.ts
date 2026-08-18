/**
 * Sample products — the filler that lets every category be browsed before the
 * real catalogue arrives (DA-33).
 *
 * The client asked for at least five products in every sub-category. There is
 * no real range to fill them with yet (DA-01), so these are invented, and they
 * are deliberately obvious about it: the name says "sample", the item code says
 * SAMPLE, and the product page already carries the placeholder notice every
 * seeded product carries.
 *
 * ONE RULE IDENTIFIES THEM, and three separate things depend on it:
 *   - prisma/seed.ts must not retire them. It deactivates any active product
 *     missing from catalog.json, and these are never in catalog.json.
 *   - scripts/check-db.ts must not count them. It asserts the database matches
 *     catalog.json exactly, and would report 750 of these as drift forever —
 *     the same mistake DA-27 fixed for categories.
 *   - prisma/seed-samples.ts --remove has to find every one of them again.
 *
 * Hence this module. Everything here is pure so the rule is unit tested rather
 * than repeated in three places and quietly allowed to diverge.
 */

/** Both prefixes are visible to buyers, which is the point. */
export const SAMPLE_SLUG_PREFIX = "sample-";
export const SAMPLE_SKU_PREFIX = "SAMPLE-";

/** What the client asked for: at least five in every sub-category. */
export const SAMPLES_PER_CATEGORY = 5;

export function isSampleSlug(slug: string | null | undefined): boolean {
  return typeof slug === "string" && slug.startsWith(SAMPLE_SLUG_PREFIX);
}

export function isSampleSkuCode(code: string | null | undefined): boolean {
  return typeof code === "string" && code.startsWith(SAMPLE_SKU_PREFIX);
}

export function sampleSlug(categorySlug: string, n: number): string {
  return `${SAMPLE_SLUG_PREFIX}${categorySlug}-${n}`;
}

export function sampleSkuCode(categorySlug: string, n: number): string {
  return `${SAMPLE_SKU_PREFIX}${categorySlug.toUpperCase()}-${n}`;
}

export function sampleName(categoryName: string, n: number): string {
  return `${categoryName} sample product ${n}`;
}

export const SAMPLE_DESCRIPTION =
  "Sample listing. It exists so this category can be browsed and tested before the real catalogue is loaded, and it is not a product AussieMed sells. Every one of these is removed the day the real range is uploaded.";

/**
 * Deterministic, so re-running the seed does not reprice the catalogue and a
 * screenshot taken today still matches the site tomorrow. FNV-1a over the slug:
 * any stable hash would do, and this one needs no dependency.
 */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * AED 5.00 to AED 249.50, on a clean half-dirham. Prices are integer fils
 * everywhere in this system; a sample is not an excuse to introduce a float.
 */
export function samplePriceFils(categorySlug: string, n: number): number {
  const steps = hash(`${categorySlug}#${n}`) % 490; // 0..489 half-dirhams
  return 500 + steps * 50;
}

/**
 * A little variety so a listing page exercises the pack rendering rather than
 * showing the same word 750 times. Kept to two shapes: anything richer would be
 * inventing packaging nobody has agreed (DA-20).
 */
export function samplePack(n: number): {
  unitLabel: string;
  unitShortLabel: string;
  eachesPerPack: number;
} {
  return n % 2 === 0
    ? { unitLabel: "10 Pieces/Box", unitShortLabel: "Box", eachesPerPack: 10 }
    : { unitLabel: "Each", unitShortLabel: "Each", eachesPerPack: 1 };
}

/**
 * One in five is out of stock, so the in-stock filter, the out-of-stock badge
 * and the Notify Me form all have something to act on in a fresh category.
 */
export function sampleOutOfStock(n: number): boolean {
  return n % SAMPLES_PER_CATEGORY === 0;
}

/**
 * How many to add to a category that already holds some. Never removes, never
 * tops up past the target, and treats a category that is already full as done.
 */
export function samplesNeeded(existingActive: number): number {
  return Math.max(0, SAMPLES_PER_CATEGORY - existingActive);
}
