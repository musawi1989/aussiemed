"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Admin section navigation.
 *
 * A client component only because the current section has to be known in the
 * browser; the pages themselves stay server-rendered.
 */
const SECTIONS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/suppliers", label: "Suppliers" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit", label: "Audit trail" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="mt-5 border-b border-border-base">
      <ul className="-mb-px flex flex-wrap gap-x-1">
        {SECTIONS.map((section) => {
          // Dashboard matches only itself; every other section also owns the
          // screens nested beneath it.
          const active =
            section.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(section.href);
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={`block border-b-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                  active
                    ? "border-red text-red"
                    : "border-transparent text-text-muted hover:border-border-strong hover:text-navy"
                }`}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
