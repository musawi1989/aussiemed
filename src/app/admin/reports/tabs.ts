import type { SectionTab } from "@/components/admin/SectionTabs";

/**
 * Reports are their own section, not a tab hanging off each list.
 *
 * They were one apiece under Products, Customers and Suppliers, which put
 * three answers to "how is the business doing" in three different places and
 * meant nobody found the second one. Moved 24 Aug 2026 at the client's
 * request. The old URLs redirect rather than 404, since they are three months
 * of somebody's bookmarks.
 *
 * Profit leads because it is the question the others are asked in service of.
 */
export const REPORT_TABS: SectionTab[] = [
  { href: "/admin/reports", label: "Profit", exact: true },
  { href: "/admin/reports/products", label: "Products" },
  { href: "/admin/reports/customers", label: "Customers" },
  { href: "/admin/reports/suppliers", label: "Suppliers" },
];
