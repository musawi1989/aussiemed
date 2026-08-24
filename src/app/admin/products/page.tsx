import Link from "next/link";
import { db } from "@/lib/db";
import { contains } from "@/lib/db-search";
import { formatAED } from "@/lib/money";
import { PRODUCT_STATUSES } from "@/lib/admin";
import { UrlFilters } from "@/components/UrlFilters";
import { StatusPill } from "@/components/StatusPill";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { Pagination } from "@/components/Pagination";
import { PRODUCT_TABS } from "./tabs";

// 50 rather than 25: at 2,068 products the old size meant 83 pages, and a
// row of this table is one line. Fifty fills a screen without making the
// query slow enough to notice.
const PAGE_SIZE = 50;
const aed = (fils: number) => formatAED(fils / 100);

/**
 * The product list.
 *
 * Filters are URL state, not component state: an admin who finds the twelve
 * products needing attention can send that link to a colleague, and the back
 * button does what it looks like it does.
 *
 * ⚠ SAMPLE PRODUCTS ARE HIDDEN BY DEFAULT, and this is the only filter here
 * with a non-empty default. 1,997 of 2,068 products are invented placeholders
 * (DA-33) due for deletion at launch (DA-34); they have no supplier, no real
 * price, and six of them share the name "Accessories sample product 1".
 * Listing them first meant page one of eighty-three was entirely fake data
 * and the seventy-one real products were unreachable without searching for
 * one by name.
 *
 * NOTHING IS HIDDEN QUIETLY. The count and a one-click way to show them sit
 * above the table, and the choice is in the URL like every other filter, so
 * a link still says what it shows. When DA-34 removes the samples this
 * filter becomes a no-op and can go with them.
 */
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const v = params[key];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };

  const q = one("q").trim();
  const status = one("status");
  const supplierId = one("supplier");
  const stock = one("stock");
  const categoryId = one("category");
  /*
   * "samples" is absent by default and means hidden — the opposite way
   * round to every other filter here, where absent means no filtering. It
   * reads backwards on purpose: the useful default is the one that shows
   * real products, and a URL with nothing in it should give somebody the
   * list they came for.
   *
   * Two states only, and no dropdown: the line above the table toggles it,
   * beside the count it is about.
   */
  const samples = one("samples") === "show" ? "show" : "";
  const page = Math.max(1, Number(one("page")) || 1);

  const where = {
    ...(q
      ? {
          OR: [
            { name: contains(q) },
            { slug: contains(q) },
            { skus: { some: { skuCode: contains(q) } } },
          ],
        }
      : {}),
    ...(PRODUCT_STATUSES.includes(status as (typeof PRODUCT_STATUSES)[number])
      ? { status }
      : {}),
    // Supply is per pack now, and a product can have a primary and a backup,
    // so "products from this supplier" means any pack they can supply.
    ...(supplierId
      ? { skus: { some: { supplies: { some: { supplierId } } } } }
      : {}),
    ...(stock === "out"
      ? { skus: { some: { manualOutOfStock: true, isActive: true } } }
      : {}),
    // The slug prefix is the sample marker the seeder, db:check and the
    // removal script all key on — DA-33. One rule, four readers.
    ...(samples === "show" ? {} : { NOT: { slug: { startsWith: "sample-" } } }),
    ...(categoryId ? { categories: { some: { categoryId } } } : {}),
  };

  /*
   * Counted alongside, so the page can say what it is not showing.
   *
   * A hidden row that nothing accounts for is the reason people distrust a
   * filtered list — "2,068 products" in one place and "71" in another, with
   * nothing joining them up.
   */
  const [total, products, suppliers, categories, sampleCount] =
    await Promise.all([
      db.productMaster.count({ where }),
      db.productMaster.findMany({
        where,
        include: {
          brand: { select: { name: true } },
          categories: { select: { categoryId: true } },
          skus: {
            where: { isActive: true },
            orderBy: { eachesPerPack: "asc" },
            select: {
              priceFils: true,
              skuCode: true,
              manualOutOfStock: true,
              supplies: {
                where: { rank: "Primary" },
                select: { supplier: { select: { companyName: true } } },
              },
            },
          },
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.supplier.findMany({
        orderBy: { companyName: "asc" },
        select: { id: true, companyName: true },
      }),
      /*
       * Categories that actually hold something, with their parent, so the
       * dropdown can disambiguate.
       *
       * "Accessories" exists in six places in this tree; six identical options
       * is a dropdown nobody can choose from. Showing the parent turns them
       * into six distinguishable shelves.
       */
      db.category.findMany({
        where: { isActive: true, products: { some: {} } },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          parent: { select: { name: true } },
        },
      }),
      db.productMaster.count({ where: { slug: { startsWith: "sample-" } } }),
    ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** The current URL with some keys changed — undefined removes one. */
  const hrefWith = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const single = Array.isArray(value) ? value[0] : value;
      if (single) next.set(key, single);
    }
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/admin/products?${qs}` : "/admin/products";
  };

  /* Every filter except the page, for the pager to carry forward. */
  const pagerParams = {
    q: q || undefined,
    status: status || undefined,
    supplier: supplierId || undefined,
    stock: stock || undefined,
    category: categoryId || undefined,
    samples: samples || undefined,
  };

  return (
    <>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">
            Products
          </h1>
          {/* Grouped, like the counts in the banner below it. "2068" and
              "1,997" on the same screen read as two different kinds of
              number. */}
          <p className="mt-1 text-sm text-text-muted tnum">
            {total.toLocaleString()} {total === 1 ? "product" : "products"}
            {page > 1 ? ` · page ${page} of ${pages}` : ""}
          </p>
        </div>

        {/* Two ways in, because they are genuinely different jobs: a price
            list arriving as a spreadsheet, and one new line typed in while
            somebody is on the phone about it. */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/products/upload"
            className="rounded-card border border-border-strong bg-surface px-4 py-2 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
          >
            Bulk upload
          </Link>
          <Link
            href="/admin/products/new"
            className="rounded-card bg-red px-4 py-2 text-sm font-bold text-on-red transition-colors hover:bg-red-hover"
          >
            Add a product
          </Link>
        </div>
      </div>

      <SectionTabs tabs={PRODUCT_TABS} />

      <UrlFilters
        basePath="/admin/products"
        // Picking a filter applies it; Apply becomes Clear all. The
        // search box still waits for Enter either way — a text field that
        // navigates per keystroke is a page load per letter.
        autoApply
        clearLabel="Clear all"
        // Held across a filter change, since the bar has no control for
        // it — see the note on carry. Clear all still drops it, which is
        // right: the cleared view is the default one.
        carry={{ samples: samples || undefined }}
        searchName="q"
        searchValue={q}
        searchPlaceholder="Name, slug or item code"
        selects={[
          {
            name: "status",
            label: "Any status",
            value: status,
            options: PRODUCT_STATUSES.map((s) => ({ value: s, label: s })),
          },
          {
            name: "supplier",
            label: "Any supplier",
            value: supplierId,
            options: suppliers.map((s) => ({
              value: s.id,
              label: s.companyName,
            })),
          },
          {
            name: "stock",
            label: "Any stock",
            value: stock,
            options: [{ value: "out", label: "Out of stock" }],
          },
          {
            /* The way somebody actually finds a product in a catalogue of
               this size — far more use than paging. Parent shown because
               "Accessories" is six different shelves. */
            name: "category",
            label: "Any category",
            value: categoryId,
            options: categories.map((c) => ({
              value: c.id,
              label: c.parent ? `${c.parent.name} › ${c.name}` : c.name,
            })),
          },
          /* There is deliberately no samples dropdown here. It said the
             same thing as the line below the bar, and two controls for one
             fact are two controls that can disagree about which is in
             charge. The banner's "Show them" is the control now: it sits
             beside the count it is about, which a dropdown three feet away
             cannot. The URL parameter is unchanged. */
        ]}
      />

      {/* Stated, not silent. A filtered list whose hidden rows nothing
          accounts for is why people stop trusting the number at the top —
          "2,068 products" somewhere else and "71" here, with nothing
          joining them up. */}
      {sampleCount > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-border-base bg-surface-sunken px-3 py-2 text-xs text-text-muted">
          {samples === "show" ? (
            <>
              <span>
                Showing sample products &mdash; {sampleCount.toLocaleString()}{" "}
                invented placeholders that go at launch (DA-34).
              </span>
              <Link
                href={hrefWith({ samples: undefined, page: undefined })}
                className="font-bold text-navy hover:underline"
              >
                Hide them
              </Link>
            </>
          ) : (
            <>
              <span>
                {sampleCount.toLocaleString()} sample products are hidden. They
                are placeholders with no supplier or agreed price, due for
                removal at launch (DA-34).
              </span>
              <Link
                href={hrefWith({ samples: "show", page: undefined })}
                className="font-bold text-navy hover:underline"
              >
                Show them
              </Link>
            </>
          )}
        </p>
      )}

      {products.length === 0 ? (
        <p className="mt-6 rounded-card border border-border-base bg-surface p-8 text-center text-text-muted">
          Nothing matches those filters.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-border-base bg-surface shadow-card">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-border-base bg-surface-sunken text-left">
              <tr>
                <th className="px-4 py-2.5 font-bold text-text-subtle">
                  Product
                </th>
                <th className="px-4 py-2.5 font-bold text-text-subtle">
                  Supplier
                </th>
                <th className="px-4 py-2.5 font-bold text-text-subtle">
                  Status
                </th>
                <th className="px-4 py-2.5 text-right font-bold text-text-subtle">
                  From
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const cheapest = product.skus.reduce<number | null>(
                  (min, s) =>
                    min === null || s.priceFils < min ? s.priceFils : min,
                  null,
                );
                return (
                  <tr
                    key={product.id}
                    className="border-b border-border-base last:border-0 hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="font-semibold text-navy hover:underline"
                      >
                        {product.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-text-subtle tnum">
                        {product.skus[0]?.skuCode ?? "no active SKU"}
                        {product.brand ? ` · ${product.brand.name}` : ""}
                        {product.categories.length === 0 && (
                          <span className="ml-1 font-bold text-danger">
                            · no category
                          </span>
                        )}
                        {product.skus.some((s) => s.manualOutOfStock) && (
                          <span className="ml-1 font-bold text-accent">
                            · out of stock
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {/* The primary supplier of its packs. Distinct packs can
                        have different primaries, so this lists what is there
                        rather than pretending there is one answer. */}
                      {[
                        ...new Set(
                          product.skus.flatMap((sku) =>
                            sku.supplies.map((s) => s.supplier.companyName),
                          ),
                        ),
                      ].join(", ") || "no supplier set"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill axis="record" status={product.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tnum text-text">
                      {cheapest === null ? "—" : aed(cheapest)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* The shared windowed pager, not a button per page. This list rendered
          all 83 of them, which was more pagination than table. */}
      <div className="mt-4">
        <Pagination
          page={page}
          pageCount={pages}
          params={pagerParams}
          basePath="/admin/products"
        />
      </div>
    </>
  );
}
