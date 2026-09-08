import type { SectionTab } from "@/components/admin/SectionTabs";

export const SUPPLIER_TABS: SectionTab[] = [
  { href: "/admin/suppliers", label: "Suppliers", exact: true },
  { href: "/admin/suppliers/cover", label: "Cover" },
  { href: "/admin/suppliers/prices", label: "Price requests" },
  { href: "/admin/suppliers/daily", label: "Daily demand" },
];
