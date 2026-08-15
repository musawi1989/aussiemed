import "server-only";

import { db } from "./db";
import {
  queryProducts as runQuery,
  relatedFrom,
  suggestFrom,
  type ProductQuery,
  type ProductQueryResult,
} from "./query";
import type {
  CategoryRef,
  Department,
  Product,
  Supplier,
} from "./types";

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

/** One process-lifetime cache. The catalogue changes only on re-seed. */
let cache: {
  products: Product[];
  departments: Department[];
  suppliers: Supplier[];
  bySlug: Map<string, Product>;
  byId: Map<number, Product>;
  categoryBySlug: Map<string, CategoryRef & { parentId: number | null }>;
  categoryById: Map<number, CategoryRef & { parentId: number | null }>;
} | null = null;

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
  if (cache) return cache;

  const [dbCategories, dbSuppliers, dbProducts] = await Promise.all([
    db.category.findMany({ orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }] }),
    db.supplier.findMany({ orderBy: { companyName: "asc" } }),
    db.productMaster.findMany({
      where: { status: "Active" },
      include: {
        brand: true,
        supplier: true,
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
      orderBy: { name: "asc" },
    }),
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

  const departments: Department[] = dbCategories
    .filter((c) => c.parentId === null)
    .map((dept) => ({
      id: catNumeric.get(dept.id)!,
      name: dept.name,
      slug: dept.slug,
      children: dbCategories
        .filter((c) => c.parentId === dept.id)
        .map((child) => ({
          id: catNumeric.get(child.id)!,
          name: child.name,
          slug: child.slug,
          parentId: catNumeric.get(dept.id)!,
        })),
    }));

  /* ---- suppliers ---- */

  const supIds = assignIds(dbSuppliers.map((s) => `sup:${s.companyName}`));
  const supNumeric = new Map<string, number>(
    dbSuppliers.map((s) => [s.id, supIds.get(`sup:${s.companyName}`)!])
  );

  const suppliers: Supplier[] = dbSuppliers.map((s) => ({
    id: supNumeric.get(s.id)!,
    name: s.companyName,
    // Every supplier in the database today is seeded, not a real trading
    // partner. DA-06 tracks replacing them.
    isPlaceholder: true,
  }));

  /* ---- products ---- */

  const prodIds = assignIds(dbProducts.map((p) => `prod:${p.slug}`));

  const products: Product[] = dbProducts.map((p) => {
    const path = p.categories
      .map((pc) => categoryById.get(catNumeric.get(pc.categoryId)!))
      .filter((c): c is CategoryRef & { parentId: number | null } => Boolean(c))
      // Parent first, so the breadcrumb reads department then category.
      .sort((a, b) => (a.parentId === null ? -1 : b.parentId === null ? 1 : 0))
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
      supplierId: supNumeric.get(p.supplierId) ?? 0,
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
    products,
    departments,
    suppliers,
    bySlug: new Map(products.map((p) => [p.slug, p])),
    byId: new Map(products.map((p) => [p.id, p])),
    categoryBySlug,
    categoryById,
  };
  return cache;
}

/** Drops the cache — call after a write once the admin panel exists. */
export function invalidateCatalog() {
  cache = null;
}

export { PAGE_SIZE } from "./query";
export type { ProductQuery, ProductQueryResult, SortKey } from "./query";

export async function getDepartments(): Promise<Department[]> {
  return (await load()).departments;
}

export async function getAllProducts(): Promise<Product[]> {
  return (await load()).products;
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

export async function getSuppliers(): Promise<Supplier[]> {
  return (await load()).suppliers;
}

export async function getSupplier(id: number) {
  return (await load()).suppliers.find((s) => s.id === id);
}

export async function getSupplierName(id: number): Promise<string> {
  return (await getSupplier(id))?.name ?? `Supplier ${id}`;
}

export async function getVatRate(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: "vatRateBasisPoints" } });
  return row ? Number(row.value) / 10000 : 0.05;
}
