import type { SectionTab } from "@/components/admin/SectionTabs";

/** Shared so the list and the reports cannot drift apart. */
export const CUSTOMER_TABS: SectionTab[] = [
  { href: "/admin/customers", label: "Accounts", exact: true },
  { href: "/admin/customers/reports", label: "Reports" },
];
