import Link from "next/link";
import { getDepartments } from "@/lib/catalog";

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

  return (
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
        {activeCategory && (
          <Link
            href={hrefWith(params, { category: undefined })}
            className="mb-2 inline-block text-xs font-medium text-brand hover:underline"
          >
            Clear category filter
          </Link>
        )}
        <ul className="space-y-0.5">
          {departments.map((dept) => {
            const deptCount = facetCounts[dept.id] ?? 0;
            const isActiveDept =
              activeCategory === dept.slug ||
              dept.children.some((c) => c.slug === activeCategory);
            // Only expand the department the buyer is actually inside — 135
            // sub-categories at once is not navigable.
            const visibleChildren = isActiveDept
              ? dept.children.filter((c) => (facetCounts[c.id] ?? 0) > 0)
              : [];

            if (deptCount === 0 && !isActiveDept) return null;

            return (
              <li key={dept.id}>
                <Link
                  href={hrefWith(params, { category: dept.slug })}
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
                    {visibleChildren.map((child) => (
                      <li key={child.id}>
                        <Link
                          href={hrefWith(params, { category: child.slug })}
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
                      </li>
                    ))}
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
  );
}
