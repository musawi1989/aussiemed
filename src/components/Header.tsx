"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { suggest } from "@/lib/catalog";
import { formatAED } from "@/lib/money";
import { useStore } from "@/lib/store";
import type { Department } from "@/lib/types";

export function Header({ departments }: { departments: Department[] }) {
  const { totals, wishlist, quoteLines, ready } = useStore();
  const [openDept, setOpenDept] = useState<number | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  // Close the department flyout on outside click or Escape.
  useEffect(() => {
    if (openDept === null) return;
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDept(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenDept(null);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [openDept]);

  return (
    <header className="sticky top-0 z-40 border-b border-border-base bg-surface">
      {/* Trade strip */}
      <div className="border-b border-border-base bg-surface-sunken">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-1.5 text-xs text-text-muted">
          <p>Trade supply for clinics, laboratories and aged care across the UAE</p>
          <p className="hidden sm:block">
            All prices in AED, excluding 5% VAT
          </p>
        </div>
      </div>

      {/* Wraps on small screens so the search box drops to its own full-width
          row rather than disappearing — search is the primary way a trade buyer
          finds a known SKU. */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setMobileNav((v) => !v)}
          aria-label="Toggle category menu"
          aria-expanded={mobileNav}
          className="-ml-1 rounded-card p-2 text-text-muted hover:bg-surface-hover lg:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-card bg-brand text-on-brand">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight text-text">
            AussieMed
          </span>
        </Link>

        {/* Only the search box needs a Suspense boundary (it reads
            useSearchParams). Keeping the boundary this small means the rest of
            the header hydrates in the normal pass — when the whole header was
            suspended, the store's mount effect landed first and the cart badge
            hydrated against server HTML that had no badge. */}
        <Suspense
          fallback={
            <div className="order-last h-10 w-full min-w-0 md:order-none md:w-auto md:flex-1" />
          }
        >
          <SearchBox />
        </Suspense>

        <div className="ml-auto flex items-center gap-1">
          {/* Account stays visible on mobile — reorder-first is the primary
              path for a returning buyer. Quote and wishlist fall back to the
              footer on the narrowest screens. */}
          <Link
            href="/account"
            className="rounded-card p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
            aria-label="Your account"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="12" cy="8.5" r="3.7" />
              <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
            </svg>
          </Link>

          <Link
            href="/quote"
            className="relative hidden rounded-card p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text sm:block"
            aria-label="Quote request"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M6 3h8l4 4v14H6z" />
              <path d="M14 3v4h4M9 12h6M9 16h4" />
            </svg>
            {ready && quoteLines.length > 0 && (
              <Badge count={quoteLines.length} />
            )}
          </Link>

          <Link
            href="/wishlist"
            className="relative hidden rounded-card p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text sm:block"
            aria-label="Wishlist"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M12 20.5 4.2 12.9a4.7 4.7 0 0 1 0-6.7 4.8 4.8 0 0 1 6.8 0l1 1 1-1a4.8 4.8 0 0 1 6.8 0 4.7 4.7 0 0 1 0 6.7Z" />
            </svg>
            {ready && wishlist.length > 0 && <Badge count={wishlist.length} />}
          </Link>

          <Link
            href="/cart"
            className="relative flex items-center gap-2 rounded-card px-2.5 py-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
            aria-label="Cart"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M3 4h2.2l2.1 11.2A2 2 0 0 0 9.3 17h8.1a2 2 0 0 0 2-1.6L21 7H6.3" />
              <circle cx="10" cy="20" r="1.3" />
              <circle cx="18" cy="20" r="1.3" />
            </svg>
            {ready && totals.itemCount > 0 && <Badge count={totals.itemCount} />}
          </Link>
        </div>
      </div>

      {/* Department bar */}
      <div
        ref={navRef}
        className={`border-t border-border-base ${mobileNav ? "block" : "hidden"} lg:block`}
      >
        {/* Eleven department names do not fit on one row at every width. Rather
            than let them wrap into a ragged three-line block, keep them on a
            single line and scroll horizontally when space runs out. */}
        <div className="mx-auto max-w-7xl px-4 lg:overflow-x-auto">
          <ul className="flex flex-col lg:flex-row lg:items-center lg:gap-0.5 lg:whitespace-nowrap">
            <li>
              <Link
                href="/products"
                className="block py-2.5 text-sm font-medium text-text hover:text-brand lg:px-2.5"
              >
                All products
              </Link>
            </li>
            {departments.map((dept) => (
              <li key={dept.id} className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setOpenDept((cur) => (cur === dept.id ? null : dept.id))
                  }
                  aria-expanded={openDept === dept.id}
                  className={`flex w-full items-center gap-1 py-2.5 text-left text-sm transition-colors hover:text-brand lg:w-auto lg:px-2.5 ${
                    openDept === dept.id ? "text-brand" : "text-text-muted"
                  }`}
                >
                  {dept.name}
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-3.5 w-3.5 transition-transform ${
                      openDept === dept.id ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {openDept === dept.id && (
                  <div className="z-30 w-full rounded-panel border-border-base bg-surface pb-3 lg:absolute lg:left-0 lg:top-full lg:w-80 lg:border lg:p-3 lg:shadow-raised">
                    <Link
                      href={`/products?category=${dept.slug}`}
                      onClick={() => {
                        setOpenDept(null);
                        setMobileNav(false);
                      }}
                      className="block rounded-card px-2 py-1.5 text-sm font-medium text-brand hover:bg-surface-hover"
                    >
                      All {dept.name}
                    </Link>
                    <ul className="mt-1 max-h-80 overflow-y-auto">
                      {dept.children.map((child) => (
                        <li key={child.id}>
                          <Link
                            href={`/products?category=${child.slug}`}
                            onClick={() => {
                              setOpenDept(null);
                              setMobileNav(false);
                            }}
                            className="block rounded-card px-2 py-1.5 text-sm text-text-muted hover:bg-surface-hover hover:text-text"
                          >
                            {child.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
            <li className="lg:ml-auto">
              <Link
                href="/bulk-buy"
                className="block py-2.5 text-sm font-medium text-accent hover:underline lg:px-3"
              >
                Bulk buy enquiry
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold tnum text-on-brand">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = open ? suggest(term, 6) : [];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
    const q = term.trim();
    if (highlight >= 0 && matches[highlight]) {
      go(`/products/${matches[highlight].slug}`);
      return;
    }
    go(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
  };

  return (
    <div
      ref={boxRef}
      className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1"
    >
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="relative mx-auto max-w-xl">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
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
            placeholder="Search products, brands or SKUs"
            aria-label="Search products"
            className="h-10 w-full rounded-card border border-border-base bg-canvas pl-9 pr-3 text-sm text-text placeholder:text-text-subtle focus:border-brand"
          />

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
                      i === highlight ? "bg-surface-hover" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-text">
                        {product.name}
                      </span>
                      <span className="block truncate text-xs text-text-subtle tnum">
                        {product.sku}
                        {product.brand ? ` · ${product.brand}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium tnum text-text-muted">
                      {formatAED(product.priceAED)}
                    </span>
                  </button>
                </li>
              ))}
              <li className="border-t border-border-base">
                <button
                  type="button"
                  onClick={submit}
                  className="w-full px-3 py-2 text-left text-sm font-medium text-brand hover:bg-surface-hover"
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
