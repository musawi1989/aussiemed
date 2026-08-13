import catalogData from "@/data/catalog.json";
import {
  queryProducts as runQuery,
  relatedFrom,
  suggestFrom,
  type ProductQuery,
  type ProductQueryResult,
} from "./query";
import type { Catalog, CategoryRef, Department, Product } from "./types";

/**
 * Binds the pure query functions in query.ts to the JSON catalogue.
 *
 * This module is the seam: when the database arrives, only the loading here
 * changes — the querying rules and every page that calls them stay put.
 */

const catalog = catalogData as unknown as Catalog;

export { PAGE_SIZE } from "./query";
export type { ProductQuery, ProductQueryResult, SortKey } from "./query";

export function getDepartments(): Department[] {
  return catalog.departments;
}

export function getAllProducts(): Product[] {
  return catalog.products;
}

export function getProductBySlug(slug: string): Product | undefined {
  return catalog.products.find((p) => p.slug === slug);
}

export function getProductById(id: number): Product | undefined {
  return catalog.products.find((p) => p.id === id);
}

/** Flat id/slug lookups covering both departments and their children. */
type FlatCategory = CategoryRef & { parentId: number | null };

const categoryById = new Map<number, FlatCategory>();
const categoryBySlug = new Map<string, FlatCategory>();

for (const dept of catalog.departments) {
  const d: FlatCategory = {
    id: dept.id,
    name: dept.name,
    slug: dept.slug,
    parentId: null,
  };
  categoryById.set(dept.id, d);
  categoryBySlug.set(dept.slug, d);

  for (const child of dept.children) {
    const c: FlatCategory = {
      id: child.id,
      name: child.name,
      slug: child.slug,
      parentId: dept.id,
    };
    categoryById.set(child.id, c);
    categoryBySlug.set(child.slug, c);
  }
}

export function getCategoryBySlug(slug: string): FlatCategory | undefined {
  return categoryBySlug.get(slug);
}

export function getCategoryById(id: number): FlatCategory | undefined {
  return categoryById.get(id);
}

export function queryProducts(query: ProductQuery = {}): ProductQueryResult {
  return runQuery(catalog.products, (slug) => categoryBySlug.get(slug), query);
}

export function suggest(term: string, limit = 6): Product[] {
  return suggestFrom(catalog.products, term, limit);
}

export function relatedProducts(product: Product, limit = 4): Product[] {
  return relatedFrom(catalog.products, product, limit);
}

export function getVatRate(): number {
  return catalog.vatRate;
}

const supplierById = new Map(catalog.suppliers.map((s) => [s.id, s]));

export function getSupplier(id: number) {
  return supplierById.get(id);
}

export function getSupplierName(id: number): string {
  return supplierById.get(id)?.name ?? `Supplier ${id}`;
}

export function getSuppliers() {
  return catalog.suppliers;
}
