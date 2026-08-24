import type { SectionTab } from "@/components/admin/SectionTabs";

/**
 * One tab today, kept as a strip rather than removed.
 *
 * Reports moved out to their own section on 24 Aug 2026, leaving Accounts
 * alone here. The strip stays because the next screen added to this
 * section should appear beside it rather than have to reinstate it, and a
 * single tab costs one line of chrome.
 */
export const CUSTOMER_TABS: SectionTab[] = [
  { href: "/admin/customers", label: "Accounts", exact: true },
];
