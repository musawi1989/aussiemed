import Link from "next/link";
import { db } from "@/lib/db";
import { contains } from "@/lib/db-search";
import { formatAED } from "@/lib/money";
import { PRODUCT_STATUSES } from "@/lib/admin";
import { AdminFilters } from "@/components/AdminFilters";
import { StatusPill } from "@/components/StatusPill";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { PRODUCT_TABS } from "./tabs";

const PAGE_SIZE = 25;
const aed = (fils: number) => formatAED(fils / 100);

/**
 * The product list.
 *
 * Filters are URL state, not component state: an admin who finds the twelve
 * products needing attention can send that link to a colleague, and the back
 * button does what it looks like it does.
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
  };

  const [total, products, suppliers] = await Promise.all([
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
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">Products</h1>
          <p className="mt-1 text-sm text-text-muted tnum">
            {total} {total === 1 ? "product" : "products"}
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

      <AdminFilters
        basePath="/admin/products"
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
        ]}
      />

      {products.length === 0 ? (
        <p className="mt-6 rounded-card border border-border-base bg-surface p-8 text-center text-text-muted">
          Nothing matches those filters.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-border-base bg-surface shadow-card">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-border-base bg-surface-sunken text-left">
              <tr>
                <th className="px-4 py-2.5 font-bold text-text-subtle">Product</th>
                <th className="px-4 py-2.5 font-bold text-text-subtle">Supplier</th>
                <th className="px-4 py-2.5 font-bold text-text-subtle">Status</th>
                <th className="px-4 py-2.5 text-right font-bold text-text-subtle">
                  From
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const cheapest = product.skus.reduce<number | null>(
                  (min, s) => (min === null || s.priceFils < min ? s.priceFils : min),
                  null
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
                          sku.supplies.map((s) => s.supplier.companyName)
                        )
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

      {pages > 1 && (
        <nav
          aria-label="Pages"
          className="mt-4 flex flex-wrap items-center justify-center gap-1.5"
        >
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => {
            const next = new URLSearchParams(
              Object.entries(params).flatMap(([k, v]) =>
                v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]]
              ) as [string, string][]
            );
            next.set("page", String(n));
            return (
              <Link
                key={n}
                href={`/admin/products?${next.toString()}`}
                aria-current={n === page ? "page" : undefined}
                className={`rounded-card px-3 py-1.5 text-sm font-bold tnum transition-colors ${
                  n === page
                    ? "bg-navy text-on-navy"
                    : "bg-surface text-text-muted hover:bg-surface-hover"
                }`}
              >
                {n}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
