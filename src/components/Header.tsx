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
 * Mirrors the live AussieMed header: a white utility bar (logo, scoped search,
 * one sign-in button, badges) sitting above a navy nav bar with the red
 * "Browse All Category" block on the left.
 */

const MAIN_NAV = [
  { label: "Home", href: "/" },
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

  return (
    <header className="sticky top-0 z-40 bg-surface shadow-card">
      {/* ---------- utility bar ---------- */}
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setMobileNav((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={mobileNav}
          className="-ml-1 rounded-card p-2 text-navy hover:bg-surface-hover lg:hidden"
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
            className="h-14 w-auto object-contain sm:h-16"
          />
        </Link>

        <Suspense
          fallback={
            <div className="order-last h-11 w-full min-w-0 md:order-none md:w-auto md:flex-1" />
          }
        >
          <SearchBox />
        </Suspense>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          {/* One button for both doors. The Ex/Inc VAT toggle and the AED
              label were removed at the client's request — VAT is to be
              handled in the price itself later. */}
          <SignInMenu user={sessionUser} />

          <IconLink href="/quote" label="Quote request" count={ready ? quoteLines.length : 0}>
            <path d="M6 3h8l4 4v14H6z" />
            <path d="M14 3v4h4M9 12h6M9 16h4" />
          </IconLink>

          {/* The heart came out of the top bar. Saved products now live in the
              account under My products, which is where a signed-in buyer looks
              for their own things — and a permanent icon for a list most
              visitors never build was paying rent it did not earn. */}

          <IconLink href="/cart" label="Cart" count={cartReady ? cart.itemCount : 0}>
            <path d="M3 4h2.2l2.1 11.2A2 2 0 0 0 9.3 17h8.1a2 2 0 0 0 2-1.6L21 7H6.3" />
            <circle cx="10" cy="20" r="1.3" />
            <circle cx="18" cy="20" r="1.3" />
          </IconLink>
        </div>
      </div>

      {/* ---------- navy nav bar ---------- */}
      <div className="bg-navy">
        <div className="mx-auto flex max-w-[1600px] items-stretch px-0 lg:px-4">
          <div ref={browseRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setBrowseOpen((v) => !v)}
              aria-expanded={browseOpen}
              className="flex h-full items-center gap-2.5 bg-red px-5 py-3.5 text-sm font-bold uppercase tracking-wide text-on-red transition-colors hover:bg-red-hover lg:px-6"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
              <span className="hidden sm:inline">Browse All Category</span>
              <span className="sm:hidden">Categories</span>
            </button>

            {browseOpen && (
              <div className="absolute left-0 top-full z-40 max-h-[70vh] w-[min(92vw,20rem)] overflow-y-auto border border-border-base bg-surface py-1 shadow-raised">
                {/* The whole range, whether or not it is stocked today. The
                    client asked for the full tree on 18 Aug 2026 (DEC-27); an
                    entry that leads nowhere is answered by the not-stocked-yet
                    page rather than by hiding the category. */}
                {departments
                  .map((dept) => {
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

          <nav
            aria-label="Main"
            className={`${mobileNav ? "block" : "hidden"} w-full lg:ml-auto lg:block lg:w-auto`}
          >
            <ul className="flex flex-col lg:flex-row lg:items-stretch">
              {MAIN_NAV.map((item) => (
                <li key={item.href}>
                  <NavLink href={item.href} onNavigate={() => setMobileNav(false)}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  children,
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="group relative flex items-center px-5 py-3.5 text-sm font-bold uppercase tracking-wide text-on-navy/90 transition-colors hover:text-on-navy lg:px-6"
    >
      {children}
      {/* The theme marks the current section with a short red underline. */}
      <span className="absolute inset-x-5 bottom-0 h-[3px] scale-x-0 bg-red transition-transform group-hover:scale-x-100 lg:inset-x-6" />
    </Link>
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
      className="relative shrink-0 text-text transition-colors hover:text-navy"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.7}>
        {children}
      </svg>
      <span className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red px-1 text-[10px] font-bold tnum text-on-red">
        {count > 99 ? "99+" : count}
      </span>
    </Link>
  );
}

function SearchBox() {
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
    <div
      ref={boxRef}
      className="order-last w-full min-w-0 md:order-none md:w-auto md:max-w-2xl md:flex-1"
    >
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {/* One pill. The scope dropdown that used to sit on the left is gone:
            it was set to "All" on effectively every search, it pushed the box
            people actually type in to the right, and it filled up with empty
            departments. Narrowing by category is what the filters on the
            products page are for, and they do it better because they show how
            many results each one holds. */}
        {/* The focus ring sits on the pill, not on the input inside it.
            The global focus-visible rule draws a rectangle with an offset,
            which around a rounded-full box reads as a stray blue slab that
            stops short of the button. Moving it out here lets it follow the
            shape, and the input below opts out of drawing its own. */}
        <div className="relative flex items-stretch rounded-full border border-border-strong bg-surface transition-colors focus-within:border-navy">
          <input
            type="search"
            value={term}
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
                setOpen(false);
                setHighlight(-1);
              }
            }}
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls="search-suggestions"
            aria-autocomplete="list"
            placeholder="What can we help you find?"
            aria-label="Search products"
            className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-text placeholder:text-text-subtle focus:outline-none focus-visible:outline-none"
          />

          <button
            type="submit"
            aria-label="Search"
            className="flex w-12 shrink-0 items-center justify-center rounded-r-card bg-red text-on-red transition-colors hover:bg-red-hover"
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
