"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Tabs within one back-office section.
 *
 * A section's list and its reports are the same subject asked two different
 * questions, so they belong beside each other rather than in separate places
 * in the sidebar. The sidebar keeps one entry per section; this splits what is
 * behind it.
 */
export type SectionTab = { href: string; label: string; exact?: boolean };

export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Section" className="mt-4 border-b border-border-base">
      <ul className="-mb-px flex flex-wrap gap-1">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`inline-block border-b-2 px-4 py-2 text-sm transition-colors ${
                  active
                    ? "border-red font-bold text-text"
                    : "border-transparent font-medium text-text-muted hover:border-border-strong hover:text-text"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
