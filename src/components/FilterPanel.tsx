import Link from "next/link";
import { getDepartments } from "@/lib/catalog";
import { BUSINESS_TYPES, businessTypeByCode } from "@/lib/business-types";
import { hrefWith, type FilterParams as Params } from "@/lib/filter-href";
import { FilterScroll } from "./FilterScroll";
import { FilterSection } from "./FilterSection";

export async function FilterPanel({
  params,
  facetCounts,
  brands,
}: {
  params: Params;
  facetCounts: Record<number, number>;
  brands: { name: string; count: number }[];
}) {
  const departments = await getDepartments();
  const activeCategory = params.category;
  // The same list does two jobs. While browsing it is the way around the site
  // and shows the whole range (DEC-27), stocked or not. Once a search term, a
  // brand or a trade is in play it is a filter, and a filter offering a choice
  // that returns nothing is noise — so those it hides. A dental clinic should
  // see Dental, PPE and Cleaning, not eleven departments reading zero.
  const narrowed =
    Boolean(params.q?.trim()) || Boolean(params.brand) || Boolean(params.business);

  /**
   * The filter frames itself, rather than being framed by the page.
   *
   * It is one component rendered on one route, but that route is every category,
   * every search and every brand view, so where the box is decided is where it
   * stays consistent. A page that supplied its own border would be free to
   * supply a different one tomorrow.
   *
   * Sticky and scrolling in its own right: the category tree is 445 entries and
   * Dental alone opens fifty rows, which is longer than most screens. Scrolling
   * it used to mean scrolling the products away.
   */
  return (
    <div className="rounded-panel border border-border-base bg-surface shadow-card lg:sticky lg:top-40">
      <div className="flex items-center justify-between gap-2 border-b border-border-base px-4 py-3">
        <h2 className="text-sm font-bold tracking-tight text-text">Filter</h2>
        {(activeCategory ||
          params.brand ||
          params.business ||
          params.inStock === "1" ||
          params.breaks === "1" ||
          params.minPrice ||
          params.maxPrice) && (
          <Link
            href={hrefWith(params, {
              category: undefined,
              brand: undefined,
              business: undefined,
              inStock: undefined,
              breaks: undefined,
              minPrice: undefined,
              maxPrice: undefined,
            })}
            className="text-xs font-semibold text-brand hover:underline"
          >
            Clear all
          </Link>
        )}
      </div>

      <FilterScroll activeCategory={activeCategory}>
      <div className="space-y-6">
      <FilterSection title="Category">
        <ul className="space-y-0.5">
          {departments.map((dept) => {
            const deptCount = facetCounts[dept.id] ?? 0;
            // Three levels means a department can be open because of a
            // grandchild — Dental, when the buyer is inside Hand Files.
            const isActiveDept =
              activeCategory === dept.slug ||
              dept.children.some(
                (c) =>
                  c.slug === activeCategory ||
                  (c.children ?? []).some((g) => g.slug === activeCategory)
              );
            // Only expand the department the buyer is actually inside — 154
            // sub-categories at once is not navigable.
            const visibleChildren = !isActiveDept
              ? []
              : narrowed
                ? dept.children.filter((c) => (facetCounts[c.id] ?? 0) > 0)
                : dept.children;

            if (narrowed && deptCount === 0 && !isActiveDept) return null;

            return (
              <li key={dept.id} data-branch={isActiveDept ? "open" : undefined}>
                <Link
                  href={hrefWith(params, { category: dept.slug })}
                  // What FilterScroll opens the box on.
                  data-active={activeCategory === dept.slug ? "true" : undefined}
                  // A department is a heading a buyer navigates by, not one of
                  // the choices under it, but the colour carries that on its own:
                  // full text colour against the muted grey of the shelves under
                  // it. Regular weight, at the client's request — bold on fourteen
                  // rows read as shouting rather than as structure.
                  className={`flex items-center justify-between gap-2 rounded-card px-1 py-1.5 text-sm transition-colors hover:text-navy ${
                    activeCategory === dept.slug ? "text-brand" : "text-text"
                  }`}
                >
                  <span>{dept.name}</span>
                  <span className="tnum text-xs text-text-muted">{deptCount}</span>
                </Link>

                {visibleChildren.length > 0 && (
                  <ul className="ml-3 border-l border-border-base pl-3">
                    {visibleChildren.map((child) => {
                      /**
                       * Dental is three deep, so a shelf can have shelves of its
                       * own — Dental > Endodontics > Hand Files (DA-41). They
                       * open only for the one the buyer is actually inside: all
                       * 263 dental sub-shelves at once is a wall, not a filter.
                       */
                      const grandchildren = child.children ?? [];
                      const inside =
                        activeCategory === child.slug ||
                        grandchildren.some((g) => g.slug === activeCategory);
                      const openGrandchildren = !inside
                        ? []
                        : narrowed
                          ? grandchildren.filter((g) => (facetCounts[g.id] ?? 0) > 0)
                          : grandchildren;

                      return (
                        <li key={child.id}>
                          <Link
                            href={hrefWith(params, { category: child.slug })}
                            data-active={activeCategory === child.slug ? "true" : undefined}
                            className={`flex items-center justify-between gap-2 rounded-card px-1 py-1 text-sm transition-colors hover:text-text ${
                              activeCategory === child.slug
                                ? "font-medium text-brand"
                                : "text-text-muted"
                            }`}
                          >
                            <span>{child.name}</span>
                            <span className="tnum text-xs text-text-subtle">
                              {facetCounts[child.id] ?? 0}
                            </span>
                          </Link>

                          {openGrandchildren.length > 0 && (
                            <ul className="ml-3 border-l border-border-base pl-3">
                              {openGrandchildren.map((grandchild) => (
                                <li key={grandchild.id}>
                                  <Link
                                    href={hrefWith(params, { category: grandchild.slug })}
                                    data-active={
                                      activeCategory === grandchild.slug ? "true" : undefined
                                    }
                                    className={`flex items-center justify-between gap-2 rounded-card px-1 py-1 text-xs transition-colors hover:text-text ${
                                      activeCategory === grandchild.slug
                                        ? "font-medium text-brand"
                                        : "text-text-muted"
                                    }`}
                                  >
                                    <span>{grandchild.name}</span>
                                    <span className="tnum text-text-subtle">
                                      {facetCounts[grandchild.id] ?? 0}
                                    </span>
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </FilterSection>

      {/**
        * Who is buying, as a way into 2,057 products.
        *
        * A dental clinic and a café shop in almost disjoint halves of this
        * catalogue, and neither wants to start at Medical Consumables and work
        * it out. Shut by default because it is a shortcut rather than a step,
        * and open when one is chosen so the filter in force is visible.
        *
        * What each trade buys is our first pass and the client's to correct —
        * see business-types.ts.
        */}
      <FilterSection
        title="Business / practice"
        count={BUSINESS_TYPES.length}
        defaultOpen={Boolean(params.business)}
      >
        <ul className="space-y-0.5">
          {BUSINESS_TYPES.map((type) => {
            const on = businessTypeByCode(params.business)?.code === type.code;
            return (
              <li key={type.code}>
                <Link
                  href={hrefWith(params, {
                    // Clicking the one already chosen turns it off, so the only
                    // way back to everything is not the Clear all button.
                    business: on ? undefined : type.code,
                  })}
                  className={`flex items-center justify-between gap-2 rounded-card px-1 py-1.5 text-sm transition-colors hover:text-navy ${
                    on ? "font-medium text-brand" : "text-text-muted"
                  }`}
                >
                  <span>{type.label}</span>
                  {on && <span className="text-xs font-semibold text-brand">clear</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </FilterSection>

      {/*
        Availability, Price and Volume pricing have all been taken off the
        storefront at the client's request — in-stock on 19 Aug 2026, the price
        range and the volume-breaks toggle on 23 Aug. Availability was the one
        that asked a question this business cannot answer honestly: nothing is
        held in stock, the flag means "a supplier can supply it" (DEC-31), and a
        buyer ticking "in stock only" reasonably reads it as a promise about a
        shelf somewhere.

        breaks, minPrice and maxPrice still filter when they arrive in a URL and
        are simply not offered as controls; Clear all still clears them, so a
        link somebody was sent can be got out of.

        inStock is the exception and no longer filters anywhere, on the shop or
        the v1 API. Honouring it would publish what the storefront now hides:
        two result counts, subtracted, say exactly what we hold.

        What is left is what a buyer navigates by: where a thing sits, who it is
        for, and whose name is on it.
      */}

      {/* Shown while there is a choice to make — OR while a brand is chosen,
          because filtering to one brand leaves one brand in the list and the
          section used to disappear taking the buyer's own filter with it. */}
      {(brands.length > 1 || params.brand) && (
        /**
         * Shut by default, and open when a brand is chosen so the filter in
         * force is never hidden. On the full catalogue this is dozens of rows
         * between the buyer and the bottom of the panel, and almost nobody
         * browses a trade catalogue by brand first.
         */
        <FilterSection
          title="Brand"
          count={brands.length}
          defaultOpen={Boolean(params.brand)}
        >
          <ul className="space-y-0.5">
            {brands.map((brand) => (
              <li key={brand.name}>
                <Link
                  href={hrefWith(params, {
                    brand: params.brand === brand.name ? undefined : brand.name,
                  })}
                  className={`flex items-center justify-between gap-2 rounded-card px-1 py-1.5 text-sm transition-colors hover:text-text ${
                    params.brand === brand.name
                      ? "font-medium text-brand"
                      : "text-text-muted"
                  }`}
                >
                  <span>{brand.name}</span>
                  <span className="tnum text-xs text-text-subtle">{brand.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </FilterSection>
      )}
      </div>
      </FilterScroll>
    </div>
  );
}
