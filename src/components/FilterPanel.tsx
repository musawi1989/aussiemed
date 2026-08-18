import Link from "next/link";
import { getDepartments } from "@/lib/catalog";
import { FilterScroll } from "./FilterScroll";

type Params = Record<string, string | undefined>;

function hrefWith(params: Params, patch: Params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...patch })) {
    if (value) search.set(key, value);
  }
  search.delete("page"); // any filter change returns to page 1
  const qs = search.toString();
  return qs ? `/products?${qs}` : "/products";
}

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
  // and shows the whole range (DEC-27), stocked or not. Once a search term or a
  // brand is in play it is a filter, and a filter offering a choice that
  // returns nothing is noise — so those it hides, as it always did.
  const narrowed = Boolean(params.q?.trim()) || Boolean(params.brand);

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
        {(activeCategory || params.brand || params.inStock === "1") && (
          <Link
            href={hrefWith(params, {
              category: undefined,
              brand: undefined,
              inStock: undefined,
            })}
            className="text-xs font-semibold text-brand hover:underline"
          >
            Clear all
          </Link>
        )}
      </div>

      <FilterScroll>
      <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-text">Availability</h2>
        <Link
          href={hrefWith(params, {
            inStock: params.inStock === "1" ? undefined : "1",
          })}
          className="flex items-center gap-2.5 rounded-card px-1 py-1.5 text-sm text-text-muted hover:text-text"
        >
          <span
            className={`flex h-4 w-4 items-center justify-center rounded border ${
              params.inStock === "1"
                ? "border-brand bg-brand text-on-brand"
                : "border-border-strong bg-surface"
            }`}
            aria-hidden="true"
          >
            {params.inStock === "1" && (
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="m3 8 3.5 3.5L13 5" />
              </svg>
            )}
          </span>
          In stock only
        </Link>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text">Category</h2>
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
              <li key={dept.id}>
                <Link
                  href={hrefWith(params, { category: dept.slug })}
                  // What FilterScroll opens the box on.
                  data-active={activeCategory === dept.slug ? "true" : undefined}
                  className={`flex items-center justify-between gap-2 rounded-card px-1 py-1.5 text-sm transition-colors hover:text-text ${
                    activeCategory === dept.slug
                      ? "font-medium text-brand"
                      : "text-text-muted"
                  }`}
                >
                  <span>{dept.name}</span>
                  <span className="tnum text-xs text-text-subtle">{deptCount}</span>
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
      </section>

      {brands.length > 1 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-text">Brand</h2>
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
        </section>
      )}
      </div>
      </FilterScroll>
    </div>
  );
}
