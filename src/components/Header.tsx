"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { formatAED } from "@/lib/money";
import { useCatalog } from "@/lib/catalog-client";
import { useCart } from "@/lib/cart-client";
import { SignInMenu } from "./SignInMenu";
import { useStore } from "@/lib/store";
import type { Department } from "@/lib/types";

/**
 * One bar, at the client's request (19 Aug 2026): a single white rail carrying
 * the logo, the navigation, the search and the account, floating on the navy
 * ground the site already used for its second row.
 *
 * It replaces two stacked rows — a white utility bar above a navy nav bar —
 * which between them took 140 pixels off every screen before a buyer saw a
 * product. NOTHING WAS DROPPED IN THE MERGE: the department menu is the Shop
 * dropdown, the search moved behind its own button and opens the same
 * typeahead, and the cart, quote list and account button are where they were.
 * The only casualty is the Home link, which the logo has always done.
 *
 * IT ALSO GETS OUT OF THE WAY. Scrolling down hides it; the first flick upward
 * brings it back without having to reach the top of the page. On a catalogue of
 * 2,057 products a buyer scrolls a long way, and a permanently sticky bar is
 * permanently in the way — while one that only returns at the top makes people
 * scroll miles to reach the search.
 */

const MAIN_NAV = [
  { label: "Product Range", href: "/products" },
  { label: "About Us", href: "/about" },
  { label: "Get Bulk Prices", href: "/bulk-buy" },
  { label: "Contact Us", href: "/contact" },
];

export function Header({
  departments,
  sessionUser,
}: {
  departments: Department[];
  /** Passed from the layout so the header knows who is signed in without a
   *  round trip of its own. */
  sessionUser: { name: string; role: string } | null;
}) {
  const { quoteLines, ready } = useStore();
  const { cart, ready: cartReady } = useCart();
  const [browseOpen, setBrowseOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const browseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!browseOpen) return;
    const onClick = (e: MouseEvent) => {
      if (browseRef.current && !browseRef.current.contains(e.target as Node)) {
        setBrowseOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setBrowseOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [browseOpen]);

  /**
   * Hidden going down, back on the way up.
   *
   * The four-pixel deadband is the whole trick. Without it the sub-pixel
   * jitter a trackpad produces at the end of a flick reads as a change of
   * direction, and the bar flaps in and out. Near the top it is always shown,
   * because hiding it there gains nothing and looks like a fault.
   */
  useEffect(() => {
    let last = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      if (y < 100) setHidden(false);
      else if (y > last + 4) setHidden(true);
      else if (y < last - 4) setHidden(false);
      last = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Never hide with something open inside it: a menu that scrolls away while
  // it is being read looks like a fault.
  const pinned = browseOpen || mobileNav || searchOpen;

  return (
    <header
      className={`sticky top-0 z-40 bg-navy transition-transform duration-300 ${
        hidden && !pinned ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="mx-auto max-w-[1600px] px-3 py-2.5">
        <div className="flex items-center gap-2 rounded-2xl bg-surface px-3 py-2 shadow-card lg:gap-4 lg:rounded-full lg:px-5">
          <button
            type="button"
            onClick={() => setMobileNav((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={mobileNav}
            className="rounded-card p-2 text-navy hover:bg-surface-hover lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <Link href="/" className="shrink-0" aria-label="AussieMed home">
            <Image
              src="/brand/logo.png"
              alt="AussieMed"
              width={220}
              height={82}
              priority
              className="h-9 w-auto object-contain sm:h-11"
            />
          </Link>

          {/* ---------- navigation ---------- */}
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            <div ref={browseRef} className="relative">
              <button
                type="button"
                onClick={() => setBrowseOpen((v) => !v)}
                aria-expanded={browseOpen}
                className="flex items-center gap-1.5 rounded-card px-3 py-2 text-sm font-semibold text-navy transition-colors hover:bg-navy-soft"
              >
                Shop
                <Caret open={browseOpen} />
              </button>

              {browseOpen && (
                <div className="absolute left-0 top-full z-40 mt-1 max-h-[70vh] w-[min(92vw,22rem)] overflow-y-auto rounded-card border border-border-base bg-surface py-1 shadow-raised">
                  {/* The whole range, whether or not it is stocked today —
                      DEC-27. An entry that leads nowhere is answered by the
                      not-stocked-yet page rather than by hiding the category. */}
                  {departments.map((dept) => {
                    const children = dept.children;
                    return (
                      <div key={dept.id} className="border-b border-border-base last:border-0">
                        <Link
                          href={`/products?category=${dept.slug}`}
                          onClick={() => setBrowseOpen(false)}
                          className="block px-4 py-2.5 text-sm font-bold text-text transition-colors hover:bg-navy-soft hover:text-navy"
                        >
                          {dept.name}
                        </Link>
                        <ul className="pb-1.5">
                          {children.slice(0, 6).map((child) => (
                            <li key={child.id}>
                              <Link
                                href={`/products?category=${child.slug}`}
                                onClick={() => setBrowseOpen(false)}
                                className="block px-4 py-1 pl-6 text-sm text-text-muted transition-colors hover:text-red"
                              >
                                {child.name}
                              </Link>
                            </li>
                          ))}
                          {children.length > 6 && (
                            <li>
                              <Link
                                href={`/products?category=${dept.slug}`}
                                onClick={() => setBrowseOpen(false)}
                                className="block px-4 py-1 pl-6 text-xs font-semibold text-navy hover:underline"
                              >
                                + {children.length - 6} more
                              </Link>
                            </li>
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* The links wait for a wide screen. Between lg and xl the bar
                carries the logo, Shop, the search box and the account, which is
                the set a buyer uses — the rest is in the Shop menu and the
                footer. */}
            <span className="hidden items-center gap-1 xl:flex">
              {MAIN_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-card px-3 py-2 text-sm font-semibold text-navy transition-colors hover:bg-navy-soft"
                >
                  {item.label}
                </Link>
              ))}
            </span>
          </nav>

          {/* ---------- the search box itself, in the bar ---------- */}
          <div className="hidden min-w-0 flex-1 md:block lg:max-w-xl">
            <Suspense fallback={<div className="h-11" />}>
              <SearchBox />
            </Suspense>
          </div>

          {/* ---------- search, basket, account ---------- */}
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            {/* Phones only: the box is in the bar on anything wider. */}
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Search products"
              aria-expanded={searchOpen}
              className="rounded-card p-2 text-navy transition-colors hover:bg-navy-soft md:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.2-3.2" />
              </svg>
            </button>

            <IconLink href="/quote" label="Quote request" count={ready ? quoteLines.length : 0}>
              <path d="M6 3h8l4 4v14H6z" />
              <path d="M14 3v4h4M9 12h6M9 16h4" />
            </IconLink>

            <IconLink href="/cart" label="Cart" count={cartReady ? cart.itemCount : 0}>
              <path d="M3 4h2.2l2.1 11.2A2 2 0 0 0 9.3 17h8.1a2 2 0 0 0 2-1.6L21 7H6.3" />
              <circle cx="10" cy="20" r="1.3" />
              <circle cx="18" cy="20" r="1.3" />
            </IconLink>

            {/* A trade account has to be applied for and approved, so a
                visitor who has never been here needs the door BEFORE the one
                marked sign in — they have nothing to sign in with. Hidden once
                somebody is signed in, where it would only be clutter. */}
            {!sessionUser && (
              <Link
                href="/sign-up"
                className="hidden rounded-full border border-border-strong px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-navy-soft sm:block"
              >
                Request access
              </Link>
            )}

            {/* One button for both doors. */}
            <SignInMenu user={sessionUser} />
          </div>
        </div>

        {/* ---------- search, when it is asked for ---------- */}
        {searchOpen && (
          <div
            className="mt-2 rounded-2xl bg-surface p-3 shadow-card md:hidden"
            onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
          >
            <Suspense fallback={<div className="h-11" />}>
              <SearchBox autoFocus onNavigate={() => setSearchOpen(false)} />
            </Suspense>
          </div>
        )}

        {/* ---------- the same navigation, on a phone ---------- */}
        {mobileNav && (
          <nav aria-label="Main" className="mt-2 rounded-2xl bg-surface py-2 shadow-card lg:hidden">
            <Link
              href="/products"
              onClick={() => setMobileNav(false)}
              className="block px-4 py-2.5 text-sm font-bold text-navy hover:bg-navy-soft"
            >
              Shop all categories
            </Link>
            {MAIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileNav(false)}
                className="block px-4 py-2.5 text-sm font-semibold text-text hover:bg-navy-soft"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/* The Ex/Inc VAT toggle used to live here. It was removed at the client's
   request — VAT is to be carried in the displayed price instead. `includeVat`
   still exists in the store, defaulting to ex-VAT, and no longer has any UI
   control; see DEC-13 in the register. */

function IconLink({
  href,
  label,
  count,
  children,
}: {
  href: string;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="relative shrink-0 p-1 text-text transition-colors hover:text-navy"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.7}>
        {children}
      </svg>
      <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red px-1 text-[10px] font-bold tnum text-on-red">
        {count > 99 ? "99+" : count}
      </span>
    </Link>
  );
}

function SearchBox({
  autoFocus = false,
  onNavigate,
}: {
  autoFocus?: boolean;
  /** Lets the bar shut its search panel once the buyer has gone somewhere. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { suggest } = useCatalog();
  const [term, setTerm] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = open ? suggest(term, 6) : [];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setHighlight(-1);
    onNavigate?.();
    router.push(href);
  };

  const submit = () => {
    if (highlight >= 0 && matches[highlight]) {
      go(`/products/${matches[highlight].slug}`);
      return;
    }
    const search = new URLSearchParams();
    if (term.trim()) search.set("q", term.trim());
    const qs = search.toString();
    go(qs ? `/products?${qs}` : "/products");
  };

  return (
    <div ref={boxRef} className="w-full min-w-0">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {/* The focus ring sits on the pill, not on the input inside it: the
            global rule draws a rectangle with an offset, which around a
            rounded-full box reads as a stray blue slab. */}
        <div className="relative flex items-stretch rounded-full border border-border-strong bg-surface transition-colors focus-within:border-navy">
          <input
            type="search"
            value={term}
            autoFocus={autoFocus}
            onChange={(e) => {
              setTerm(e.target.value);
              setOpen(true);
              setHighlight(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, -1));
              } else if (e.key === "Escape") {
                // First Escape closes the suggestions; a second closes the panel
                // itself, which is what somebody who opened it by mistake is
                // pressing for — and while it is open the bar cannot hide.
                if (open && matches.length > 0) {
                  setOpen(false);
                  setHighlight(-1);
                } else {
                  onNavigate?.();
                }
              }
            }}
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls="search-suggestions"
            aria-autocomplete="list"
            placeholder="What can we help you find?"
            aria-label="Search products"
            className="h-11 min-w-0 flex-1 bg-transparent px-4 text-sm text-text placeholder:text-text-subtle focus:outline-none focus-visible:outline-none"
          />

          <button
            type="submit"
            aria-label="Search"
            className="flex w-12 shrink-0 items-center justify-center rounded-r-full bg-red text-on-red transition-colors hover:bg-red-hover"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
          </button>

          {matches.length > 0 && (
            <ul
              id="search-suggestions"
              role="listbox"
              className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-card border border-border-base bg-surface py-1 shadow-raised"
            >
              {matches.map((product, i) => (
                <li key={product.id} role="option" aria-selected={i === highlight}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => go(`/products/${product.slug}`)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                      i === highlight ? "bg-navy-soft" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-text">
                        {product.name}
                      </span>
                      <span className="block truncate text-xs text-text-subtle tnum">
                        {product.sku}
                        {product.brand ? ` · ${product.brand}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold tnum text-navy">
                      {formatAED(product.priceAED)}
                    </span>
                  </button>
                </li>
              ))}
              <li className="border-t border-border-base">
                <button
                  type="button"
                  onClick={submit}
                  className="w-full px-3 py-2 text-left text-sm font-bold text-red hover:bg-surface-hover"
                >
                  See all results for &ldquo;{term.trim()}&rdquo;
                </button>
              </li>
            </ul>
          )}
        </div>
      </form>
    </div>
  );
}
