"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The account's left rail.
 *
 * A client component only because the current tab has to be known in the
 * browser; every page behind it stays server-rendered.
 *
 * On a phone it becomes a scrolling row above the content rather than a
 * drawer: there are four entries, and hiding four links behind a button costs
 * more than it saves.
 */
export type AccountTab = {
  href: string;
  label: string;
  /** Shown beside the label — how many orders, how many saved products. */
  count?: number;
  exact?: boolean;
};

export function AccountTabs({ tabs }: { tabs: AccountTab[] }) {
  const pathname = usePathname();

  const isActive = (tab: AccountTab) =>
    tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);

  return (
    <nav aria-label="Your account" className="lg:w-56 lg:shrink-0">
      <ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <li key={tab.href} className="shrink-0 lg:shrink">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between gap-3 whitespace-nowrap rounded-card px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-navy-soft font-bold text-navy"
                    : "font-medium text-text-muted hover:bg-surface-hover hover:text-text"
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tnum ${
                      active ? "bg-navy text-on-navy" : "bg-surface-sunken text-text-muted"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
