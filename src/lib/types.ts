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
  /** The packaging level this break represents — "Carton", "Box". */
  unitName?: string | null;
  /** How many of the level below make this one, e.g. a box of 4 cartons. */
  unitsPerLevel?: number | null;
};

/**
 * A purchasable unit of measure. The same product is commonly sold both by the
 * box and by the carton at different prices, so the pack — not the product —
 * is what a buyer actually adds to their cart.
 */
export type Pack = {
  /** Stable id, unique within the product. Also the SKU suffix. */
  id: string;
  sku: string;
  /** Full label, e.g. "100 Pieces/Box" or "10 Boxes/Carton". */
  label: string;
  /** Short label shown beside Add to cart, e.g. "Box". */
  shortLabel: string;
  /** How many base units this pack contains — used for per-unit comparison. */
  eachesPerPack: number;
  priceAED: number;
  tiers: PriceTier[];
  outOfStock: boolean;
};

/**
 * A variant axis such as Size or Colour. Options that are unavailable stay
 * visible but disabled, so a buyer can see the range exists.
 */
export type VariantAxis = {
  name: string;
  /** The value this particular product represents. */
  selected: string;
  options: { value: string; available: boolean }[];
};

export type SpecAttribute = {
  label: string;
  value: string;
};

export type ProductDocument = {
  label: string;
  href: string;
};

/**
 * VAT treatment. Not every medical line is standard-rated, and applying 5% to
 * a zero-rated product overcharges the customer on a document they keep.
 */
export type TaxClass = "standard" | "zero-rated";

export type ProductBadge = "top-seller" | "new" | "back-soon" | "clearance";

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
  /** Mirrors the default pack, so listings have one price without resolving packs. */
  priceAED: number;
  unit: string;
  packSize: string | null;
  supplierId: number;
  outOfStock: boolean;
  images: string[];
  tiers: PriceTier[];
  taxClass: TaxClass;
  /** Products sharing a family are the same line in different sizes. */
  variantGroup?: string | null;
  /** What distinguishes this member, e.g. "375ml". */
  variantLabel?: string | null;
  /** Siblings in the same family, resolved for the dropdown. */
  familyMembers?: { slug: string; label: string; name: string; outOfStock: boolean }[];
  packs: Pack[];
  defaultPackId: string;
  variants: VariantAxis[];
  attributes: SpecAttribute[];
  documents: ProductDocument[];
  badges: ProductBadge[];
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
