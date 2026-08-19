import type { SectionTab } from "@/components/admin/SectionTabs";

/** Shared so the list and the reports cannot drift apart. */
export const PRODUCT_TABS: SectionTab[] = [
  { href: "/admin/products", label: "Products", exact: true },
  { href: "/admin/products/reports", label: "Reports" },
];
