export type CategoryRef = {
  id: number;
  name: string;
  slug: string;
};

export type Category = CategoryRef & {
  parentId?: number | null;
};

export type Department = CategoryRef & {
  children: Category[];
};

export type PriceTier = {
  /** Buying this many or more gets `priceAED` per unit. */
  minQty: number;
  priceAED: number;
};

export type Product = {
  id: number;
  skuId: number;
  slug: string;
  sku: string;
  name: string;
  brand: string | null;
  description: string | null;
  categoryId: number | null;
  categoryPath: CategoryRef[];
  priceAED: number;
  unit: string;
  packSize: string | null;
  supplierId: number;
  outOfStock: boolean;
  images: string[];
  tiers: PriceTier[];
  /** True for seed data invented during the rebuild. Never ship these. */
  isPlaceholder: boolean;
  detailKey: string | null;
  sourceNote: string | null;
};

export type Supplier = {
  id: number;
  name: string;
  /** True while the name is invented — the extraction never exposed them. */
  isPlaceholder: boolean;
};

export type Catalog = {
  generatedFrom: string;
  currency: "AED";
  vatRate: number;
  departments: Department[];
  suppliers: Supplier[];
  products: Product[];
  productCountByCategory: Record<string, number>;
};
