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
      <div ref={ref} className="relative flex shrink-0 items-center gap-2">
        <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label="Account menu"
          className="rounded-card bg-navy px-2.5 py-2 text-xs font-bold text-on-navy sm:hidden">Account</button>
        {open && <div className="absolute right-0 top-full z-50 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-card border border-border-base bg-surface p-3 shadow-raised sm:hidden">
          <Link href={home} onClick={() => setOpen(false)} className="block break-words py-2 text-sm font-semibold text-navy">{user.name}</Link>
          <SignOutButton sizeClassName="mt-2 w-full px-3 py-2 text-sm" />
        </div>}
        {/* The whole name, not the first word: a supplier account is named
            after a company, and "AussieMed Distribution" cut to "AussieMed"
            reads as this storefront rather than the account signed in. */}
        <Link
          href={home}
          // Pills, like Request access and Sign in beside them. The header
          // used to change shape when somebody signed in, because this pair
          // sits in the slot those two occupy when signed out.
          className="hidden max-w-[12rem] truncate rounded-full bg-navy px-4 py-2.5 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover sm:block"
          title={user.name}
        >
          {user.name}
        </Link>
        {/* Sign out sits in the slot the Sign in button occupies when signed
            out, so it is in the same place on every page rather than only on
            the dashboard someone happens to be looking at. */}
        {/*
          The same size as the name beside it, and the same size as the Sign in
          button this pair replaces when somebody signs in — so the header is
          one height in both states rather than growing nine pixels at the
          moment of signing in.

          THIS REVERSES THE "A FIFTH LARGER" SIZING, which was itself a client
          request. They asked for these two to match on 24 Aug 2026, and two
          buttons cannot match without one of them moving. Levelling down was
          the direction that also matched the signed-out header; levelling up
          would have made this pair the only large thing on the bar.
        */}
        <SignOutButton
          shapeClassName="rounded-full"
          sizeClassName="hidden shrink-0 px-4 py-2.5 text-sm sm:block"
        />
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
        // rounded-full to match Request access, which sits immediately
        // beside it: two buttons in one group with two different corner radii
        // read as two unrelated controls.
        className="flex items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover"
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
