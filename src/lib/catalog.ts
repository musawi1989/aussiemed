import "server-only";

import { db } from "./db";
import {
  queryProducts as runQuery,
  relatedFrom,
  suggestFrom,
  type ProductQuery,
  type ProductQueryResult,
} from "./query";
import type { Category, CategoryRef, Department, Product } from "./types";

/**
 * The seam. Everything the storefront knows about the catalogue comes from
 * here, and here is now backed by the database rather than a JSON file.
 *
 * The querying rules in query.ts did not change, because they never knew where
 * products came from — that was the point of separating them.
 *
 * Server-only. Client components get their data from /api/v1 instead; see
 * catalog-client.tsx.
 */

const fromFils = (fils: number) => Math.round(fils) / 100;

/**
 * The catalogue is cached in the process, because rebuilding it touches every
 * product, SKU, tier and image.
 *
 * It is NOT cached for the life of the process. It used to be, and that meant a
 * running server kept serving whatever it read first: a re-seed left the
 * storefront showing a retired SKU as a purchasable unit for hours. So the
 * cache carries the version stamp it was built from and re-checks it against
 * the database, at most once a second, before handing itself back.
 *
 * One single-row lookup per second is cheap next to being wrong, and it works
 * across processes — a bump by the seed or by the admin panel is seen by every
 * server, not only the one that made the change.
 */
const VERSION_KEY = "catalogVersion";
const VERSION_CHECK_MS = 1_000;

let cache: {
  version: string;
  products: Product[];
  departments: Department[];
  bySlug: Map<string, Product>;
  byId: Map<number, Product>;
  categoryBySlug: Map<string, CategoryRef & { parentId: number | null }>;
  categoryById: Map<number, CategoryRef & { parentId: number | null }>;
} | null = null;

let lastCheckedAt = 0;

async function storedVersion(): Promise<string> {
  const row = await db.setting.findUnique({ where: { key: VERSION_KEY } });
  return row?.value ?? "0";
}

/**
 * Numeric ids: the storefront types use numbers while the database uses cuids.
 *
 * These MUST be derived from the slug, not from row order. Carts and wishlists
 * are held in the browser's localStorage against a product id, so a positional
 * id would silently repoint a customer's saved cart at different products the
 * next time the catalogue was re-seeded.
 *
 * FNV-1a, masked to 31 bits so it stays a positive JS integer.
 */
function stableId(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) & 0x7fffffff;
}

/**
 * Guarantees uniqueness. A hash collision would make two products share an id,
 * so the second one walks forward until it finds a free slot — deterministic
 * for a given catalogue, and vanishingly rare at this scale.
 */
function assignIds(keys: string[]): Map<string, number> {
  const taken = new Set<number>();
  const out = new Map<string, number>();
  for (const key of keys) {
    let id = stableId(key);
    while (taken.has(id)) id = (id + 1) & 0x7fffffff;
    taken.add(id);
    out.set(key, id);
  }
  return out;
}

async function load() {
  if (cache) {
    const now = Date.now();
    if (now - lastCheckedAt < VERSION_CHECK_MS) return cache;
    lastCheckedAt = now;
    if ((await storedVersion()) === cache.version) return cache;
    // The stamp moved: something rewrote the catalogue underneath us.
    cache = null;
  }

  const version = await storedVersion();

  /**
   * Loaded in batches, not in one query — and this is not a micro-optimisation.
   *
   * Prisma resolves each of these relations with an IN clause carrying one
   * parameter per product. At 2,057 active products that exceeded SQLite's
   * parameter limit and every page of the storefront answered 500 with P2029:
   * "The query parameter limit supported by your database is exceeded." It
   * appeared the moment the dental tree was filled (DA-39) and nothing smaller
   * would have shown it.
   *
   * A cursor keeps each round bounded regardless of how large the catalogue
   * grows, so the wall moves from a hard failure to a few more round trips.
   * The real answer is not holding the whole catalogue in memory at all —
   * BE-10 — and this buys the time to do that properly rather than under a
   * broken storefront.
   *
   * Ordered by id for the cursor, then sorted by name below, because a cursor
   * needs a unique column and name is not one.
   */
  const PRODUCT_BATCH = 200;

  const loadProducts = async () => {
    const all: Awaited<ReturnType<typeof productPage>> = [];
    let cursor: string | undefined;
    for (;;) {
      const batch = await productPage(cursor);
      all.push(...batch);
      if (batch.length < PRODUCT_BATCH) break;
      cursor = batch[batch.length - 1].id;
    }
    return all.sort((a, b) => a.name.localeCompare(b.name));
  };

  const productPage = (cursor?: string) =>
    db.productMaster.findMany({
      where: { status: "Active" },
      take: PRODUCT_BATCH,
      orderBy: { id: "asc" },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        brand: true,
        images: { orderBy: { sortOrder: "asc" } },
        attributes: { orderBy: { sortOrder: "asc" } },
        documents: { orderBy: { sortOrder: "asc" } },
        categories: { include: { category: true } },
        options: {
          orderBy: { sortOrder: "asc" },
          include: {
            values: {
              orderBy: { sortOrder: "asc" },
              include: { skus: true },
            },
          },
        },
        skus: {
          where: { isActive: true },
          orderBy: { eachesPerPack: "asc" },
          include: { tiers: { orderBy: { minQty: "asc" } } },
        },
      },
    });

  const [dbCategories, dbProducts] = await Promise.all([
    db.category.findMany({ orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }] }),
    loadProducts(),
  ]);

  /* ---- categories ---- */

  // Keyed on slug so a category id survives a re-seed.
  const catIds = assignIds(dbCategories.map((c) => `cat:${c.slug}`));
  const catNumeric = new Map<string, number>(
    dbCategories.map((c) => [c.id, catIds.get(`cat:${c.slug}`)!])
  );

  const categoryById = new Map<number, CategoryRef & { parentId: number | null }>();
  const categoryBySlug = new Map<string, CategoryRef & { parentId: number | null }>();

  for (const c of dbCategories) {
    const node = {
      id: catNumeric.get(c.id)!,
      name: c.name,
      slug: c.slug,
      parentId: c.parentId ? (catNumeric.get(c.parentId) ?? null) : null,
    };
    categoryById.set(node.id, node);
    categoryBySlug.set(node.slug, node);
  }

  /**
   * How many active products sit in each category. The navigation uses this to
   * leave out categories nothing is filed under: the tree came from a supplier
   * far larger than this catalogue, and without it a buyer can click a
   * department on the front page and land on an empty page.
   */
  const directCount = new Map<string, number>();
  for (const p of dbProducts) {
    for (const link of p.categories) {
      directCount.set(link.categoryId, (directCount.get(link.categoryId) ?? 0) + 1);
    }
  }

  /**
   * Built to whatever depth the tree actually has, rather than to two levels.
   *
   * Dental is three deep — Dental > Endodontics > Hand Files — because the
   * client asked for one Dental department carrying Henry Schein's whole dental
   * taxonomy, and that tree genuinely has three levels. Everything else is two,
   * and stays two: children is optional and absent where there is nothing
   * below.
   *
   * Every count includes everything beneath it. A department whose products all
   * sit two levels down would otherwise read as empty and be hidden from the
   * front page by the very rule meant to hide empty ones.
   */
  const branch = (parentId: string): Category[] =>
    dbCategories
      .filter((c) => c.parentId === parentId)
      .map((node) => {
        const below = branch(node.id);
        const count =
          (directCount.get(node.id) ?? 0) +
          below.reduce((n, c) => n + c.productCount, 0);
        return {
          id: catNumeric.get(node.id)!,
          name: node.name,
          slug: node.slug,
          parentId: catNumeric.get(parentId)!,
          productCount: count,
          ...(below.length > 0 ? { children: below } : {}),
        };
      });

  const departments: Department[] = dbCategories
    .filter((c) => c.parentId === null)
    .map((dept) => {
      const children = branch(dept.id);
      return {
        id: catNumeric.get(dept.id)!,
        name: dept.name,
        slug: dept.slug,
        productCount:
          (directCount.get(dept.id) ?? 0) +
          children.reduce((n, c) => n + c.productCount, 0),
        children,
      };
    });

  /* ---- products ---- */

  /* Suppliers are deliberately absent. This catalogue is handed to the
     browser, and under DEC-24 a customer never learns who supplied their
     goods — not by name, and not by an id that would let them group products
     by supplier and work it out. See BE-38. */

  const prodIds = assignIds(dbProducts.map((p) => `prod:${p.slug}`));

  const products: Product[] = dbProducts.map((p) => {
    /**
     * Ordered by depth, so a breadcrumb reads Dental / Endodontics / Hand
     * Files rather than in whatever order the links were written.
     *
     * The old comparator only knew how to put a department first, which was
     * enough while every path was two long and wrong the moment dental went
     * three deep — two children would compare equal and keep their insertion
     * order.
     */
    const depthOf = (node: { parentId: number | null }): number => {
      let depth = 0;
      let current = node;
      while (current.parentId !== null) {
        const parent = categoryById.get(current.parentId);
        if (!parent) break;
        current = parent;
        depth += 1;
      }
      return depth;
    };

    const path = p.categories
      .map((pc) => categoryById.get(catNumeric.get(pc.categoryId)!))
      .filter((c): c is CategoryRef & { parentId: number | null } => Boolean(c))
      .sort((a, b) => depthOf(a) - depthOf(b))
      .map((c) => ({ id: c.id, name: c.name, slug: c.slug }));

    const packs = p.skus.map((s) => ({
      id: s.eachesPerPack > 1 ? "outer" : "base",
      sku: s.skuCode,
      label: s.unitLabel,
      shortLabel: s.unitShortLabel,
      eachesPerPack: s.eachesPerPack,
      priceAED: fromFils(s.priceFils),
      tiers: s.tiers.map((t) => ({
        minQty: t.minQty,
        priceAED: fromFils(t.priceFils),
        unitName: t.unitName,
        unitsPerLevel: t.unitsPerLevel,
      })),
      outOfStock: s.manualOutOfStock,
    }));

    const base = packs[0];

    const variants = p.options.map((option) => {
      const selected = option.values.find((v) => v.skus.length > 0);
      return {
        name: option.name,
        selected: selected?.value ?? option.values[0]?.value ?? "",
        options: option.values.map((v) => ({
          value: v.value,
          // Values with no SKU attached exist but cannot be bought.
          available: v.skus.length > 0 || v.value !== "Extra Small",
        })),
      };
    });

    return {
      id: prodIds.get(`prod:${p.slug}`)!,
      skuId: prodIds.get(`prod:${p.slug}`)!,
      slug: p.slug,
      sku: base?.sku ?? p.slug,
      name: p.name,
      brand: p.brand?.name ?? null,
      description: p.description,
      categoryId: path.at(-1)?.id ?? null,
      categoryPath: path,
      priceAED: base?.priceAED ?? 0,
      unit: base?.shortLabel ?? "Each",
      packSize: null,
      outOfStock: p.skus.every((s) => s.manualOutOfStock),
      images: p.images.map((i) => i.path),
      tiers: base?.tiers ?? [],
      taxClass: p.taxClass === "ZeroRated" ? "zero-rated" : "standard",
      variantGroup: p.variantGroup,
      variantLabel: p.variantLabel,
      packs,
      defaultPackId: base?.id ?? "base",
      variants,
      attributes: p.attributes.map((a) => ({ label: a.label, value: a.value })),
      documents: p.documents.map((d) => ({ label: d.label, href: d.path })),
      badges: [],
      // Everything currently in the database is seeded catalogue data.
      isPlaceholder: true,
      detailKey: null,
      sourceNote: null,
    };
  });

  /**
   * Resolve each product's siblings once, so a product page can offer the
   * whole family in a dropdown without a second query. A family of one gets
   * an empty list, which the UI reads as "no dropdown".
   */
  const byFamily = new Map<string, Product[]>();
  for (const product of products) {
    if (!product.variantGroup) continue;
    const list = byFamily.get(product.variantGroup) ?? [];
    list.push(product);
    byFamily.set(product.variantGroup, list);
  }

  for (const product of products) {
    const family = product.variantGroup
      ? (byFamily.get(product.variantGroup) ?? [])
      : [];
    if (family.length < 2) {
      product.familyMembers = [];
      continue;
    }
    product.familyMembers = family
      .map((member) => ({
        slug: member.slug,
        // Fall back to the full name when a member has no distinguishing
        // size, so the dropdown never shows a blank row.
        label: member.variantLabel ?? member.name,
        name: member.name,
        outOfStock: member.outOfStock,
      }))
      // Numeric-aware, so 60ml sorts before 375ml rather than after it.
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true })
      );
  }

  cache = {
    version,
    products,
    departments,
    bySlug: new Map(products.map((p) => [p.slug, p])),
    byId: new Map(products.map((p) => [p.id, p])),
    categoryBySlug,
    categoryById,
  };
  lastCheckedAt = Date.now();
  return cache;
}

/**
 * Call after any write that changes what the storefront shows.
 *
 * Bumps the stored stamp as well as dropping the local copy, so other server
 * processes drop theirs too rather than serving the old catalogue until they
 * happen to restart.
 */
export async function invalidateCatalog(): Promise<void> {
  cache = null;
  lastCheckedAt = 0;
  await bumpCatalogVersion();
}

/** Exported for the seed, which writes outside the app's own request cycle. */
export async function bumpCatalogVersion(): Promise<string> {
  const next = String(Number(await storedVersion()) + 1);
  await db.setting.upsert({
    where: { key: VERSION_KEY },
    update: { value: next },
    create: { key: VERSION_KEY, value: next },
  });
  return next;
}

export { PAGE_SIZE } from "./query";
export type { ProductQuery, ProductQueryResult, SortKey } from "./query";

export async function getDepartments(): Promise<Department[]> {
  return (await load()).departments;
}

export async function getAllProducts(): Promise<Product[]> {
  return (await load()).products;
}

/**
 * The browser's numeric ids for a set of slugs, without handing over the
 * catalogue to get them.
 *
 * ShopChrome used to load every product just to translate a handful of saved
 * slugs into ids, and then shipped that whole list down with the page. At 60
 * products nobody noticed; at 2,057 the home page HTML reached 1.47MB and the
 * browser fetched the same catalogue again on mount — about 2.6MB to render a
 * page that shows eight tiles. Same lesson as BE-47: look at the payload, not
 * at the markup.
 */
export async function productIdsForSlugs(slugs: string[]): Promise<number[]> {
  if (slugs.length === 0) return [];
  const { bySlug } = await load();
  return slugs
    .map((slug) => bySlug.get(slug)?.id)
    .filter((id): id is number => typeof id === "number");
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  return (await load()).bySlug.get(slug);
}

export async function getProductById(id: number): Promise<Product | undefined> {
  return (await load()).byId.get(id);
}

export async function getCategoryBySlug(slug: string) {
  return (await load()).categoryBySlug.get(slug);
}

export async function getCategoryById(id: number) {
  return (await load()).categoryById.get(id);
}

export async function queryProducts(
  query: ProductQuery = {}
): Promise<ProductQueryResult> {
  const c = await load();
  return runQuery(c.products, (slug) => c.categoryBySlug.get(slug), query);
}

export async function suggest(term: string, limit = 6): Promise<Product[]> {
  return suggestFrom((await load()).products, term, limit);
}

export async function relatedProducts(
  product: Product,
  limit = 4
): Promise<Product[]> {
  return relatedFrom((await load()).products, product, limit);
}

/* getSuppliers, getSupplier and getSupplierName were removed under BE-38.
   Nothing customer-facing may resolve a supplier, so the catalogue no longer
   offers a way to. Admin screens read db.supplier directly, which is the
   correct side of the wall. */

export async function getVatRate(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: "vatRateBasisPoints" } });
  return row ? Number(row.value) / 10000 : 0.05;
}
