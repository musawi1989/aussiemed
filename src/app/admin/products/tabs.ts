import type { SectionTab } from "@/components/admin/SectionTabs";

/** Shared so the list and its sibling screens cannot drift apart. */
export const PRODUCT_TABS: SectionTab[] = [
  { href: "/admin/products", label: "Products", exact: true },
  { href: "/admin/products/unallocated", label: "No supplier" },
];
