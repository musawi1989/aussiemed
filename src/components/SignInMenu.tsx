"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SignOutButton } from "./SignOutButton";

/**
 * One sign-in button with a dropdown for the two customer-facing doors.
 *
 * Buyers and suppliers use different areas, and asking someone to know which
 * button belongs to them before they have signed in is a small tax on every
 * visit. Admin is deliberately absent — staff go to /admin directly.
 *
 * When someone is already signed in the button becomes the way back to their
 * own area, so it never invites a signed-in user to sign in again.
 */
export function SignInMenu({
  user,
}: {
  user: { name: string; role: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (user) {
    const home =
      user.role === "Admin"
        ? "/admin"
        : user.role === "Supplier"
          ? "/business-portal"
          : "/account";
    return (
      <div className="flex shrink-0 items-center gap-2">
        {/* The whole name, not the first word: a supplier account is named
            after a company, and "AussieMed Distribution" cut to "AussieMed"
            reads as this storefront rather than the account signed in. */}
        <Link
          href={home}
          className="max-w-[12rem] truncate rounded-card bg-navy px-4 py-2.5 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover"
          title={user.name}
        >
          {user.name}
        </Link>
        {/* Sign out sits in the slot the Sign in button occupies when signed
            out, so it is in the same place on every page rather than only on
            the dashboard someone happens to be looking at. */}
        <SignOutButton sizeClassName="shrink-0 px-[0.9rem] py-3 text-[1.05rem]" />
      </div>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-card bg-navy px-5 py-2.5 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover"
      >
        Sign in
        <svg
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-card border border-border-base bg-surface py-1 shadow-raised"
        >
          <MenuItem
            href="/sign-in"
            title="Sign in as a buyer"
            note="Order, reorder and track your invoices"
            onNavigate={() => setOpen(false)}
          />
          <MenuItem
            href="/business-portal"
            title="Sign in as a supplier"
            note="Manage your products and see your orders"
            onNavigate={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  href,
  title,
  note,
  onNavigate,
}: {
  href: string;
  title: string;
  note: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="block px-4 py-2.5 transition-colors hover:bg-navy-soft"
    >
      <span className="block text-sm font-bold text-text">{title}</span>
      <span className="mt-0.5 block text-xs leading-snug text-text-muted">
        {note}
      </span>
    </Link>
  );
}
