"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SignOutButton } from "@/components/SignOutButton";

export type OpsLink = {
  href: string;
  label: string;
  /** Path prefix owns its nested screens. Omit to match the href exactly. */
  exact?: boolean;
  /**
   * How many things are waiting behind this link. Shown only when there are
   * any — a badge reading 0 is a queue announcing it has nothing to say.
   */
  count?: number;
};

export type OpsGroup = {
  /** Null for a group of one — no heading is better than a heading of one. */
  heading: string | null;
  icon: keyof typeof ICONS;
  links: OpsLink[];
};

/**
 * The back-office sidebar.
 *
 * Modelled on the reference operations UI: a quiet light rail, grouped
 * sections, and the operator's identity pinned to the bottom so it is never
 * a question who is about to change a customer's order.
 *
 * `print:hidden` matters more here than it looks — the three order documents
 * are printed from inside this shell, and without it every delivery note
 * carries a navigation menu onto the paper.
 */
export function OpsSidebar({
  brand,
  groups,
  user,
}: {
  brand: { label: string; href: string };
  groups: OpsGroup[];
  user: { name: string; email: string; initials: string; context: string };
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (link: OpsLink) =>
    link.exact ? pathname === link.href : pathname.startsWith(link.href);

  const rail = (
    <div className="flex h-full flex-col">
      <Link
        href={brand.href}
        className="flex items-center gap-2.5 border-b border-border-base px-4 py-4"
        onClick={() => setOpen(false)}
      >
        <Image
          src="/brand/favicon.png"
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 object-contain"
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-text">
            AussieMed
          </span>
          <span className="block truncate text-[11px] uppercase tracking-wide text-red">
            {brand.label}
          </span>
        </span>
      </Link>

      <nav aria-label={brand.label} className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group, i) => (
          <div key={group.heading ?? group.links[0]?.href ?? i} className="mb-1">
            {group.heading ? (
              <p className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                <Icon name={group.icon} />
                {group.heading}
              </p>
            ) : null}

            <ul className={group.heading ? "ml-2 border-l border-border-base" : ""}>
              {group.links.map((link) => {
                const active = isActive(link);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2 rounded-card px-2.5 py-1.5 text-sm transition-colors ${
                        group.heading ? "ml-1" : ""
                      } ${
                        active
                          ? "bg-navy-soft font-bold text-navy"
                          : "font-medium text-text-muted hover:bg-surface-hover hover:text-text"
                      }`}
                    >
                      {group.heading ? null : <Icon name={group.icon} />}
                      <span className="min-w-0 flex-1 truncate">
                        {link.label}
                      </span>
                      {link.count !== undefined && link.count > 0 && (
                        <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-bold tnum text-surface">
                          {link.count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border-base px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-navy text-xs font-bold text-on-navy"
          >
            {user.initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-text">
              {user.context}
            </span>
            <span className="block truncate text-[11px] text-text-subtle">
              {user.name}
            </span>
          </span>
          <SignOutButton className="shrink-0 rounded-card border border-border-strong bg-surface px-2 py-1 text-[11px] font-bold text-text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-60" />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile bar. The rail is too tall to sit above content on a phone. */}
      <div className="flex items-center gap-3 border-b border-border-base bg-surface px-4 py-2.5 lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Toggle navigation"
          className="rounded-card p-1.5 text-navy hover:bg-surface-hover"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span className="text-sm font-bold text-text">AussieMed</span>
        <span className="text-[11px] uppercase tracking-wide text-red">
          {brand.label}
        </span>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-text/30"
          />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-border-base bg-surface shadow-raised">
            {rail}
          </div>
        </div>
      )}

      <aside className="hidden w-60 shrink-0 border-r border-border-base bg-surface lg:block print:hidden">
        <div className="sticky top-0 h-screen">{rail}</div>
      </aside>
    </>
  );
}

const ICONS = {
  dashboard: "M4 13h7V4H4zM13 8h7V4h-7zM13 20h7v-9h-7zM4 20h7v-5H4z",
  catalogue: "M4 6h16M4 12h16M4 18h10",
  sales: "M3 4h2l2 11h10l2-8H7M9 20h.01M17 20h.01",
  people: "M16 20v-1a4 4 0 0 0-8 0v1M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7",
  system: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M4 12h2m12 0h2m-8-8v2m0 12v2",
} as const;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
