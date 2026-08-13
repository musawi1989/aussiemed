import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { getDepartments, queryProducts } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "AussieMed — Medical, Dental & Laboratory Trade Supplies",
  description:
    "Trade supplier of medical, dental, laboratory and cleaning consumables across the UAE. Volume price breaks on every line, priced in AED excluding 5% VAT.",
};

const VALUE_PROPS = [
  {
    title: "Volume pricing on every line",
    body: "Price breaks are published on the product page, not hidden behind a quote request.",
  },
  {
    title: "One reference number per order",
    body: "Order across multiple suppliers and track it all under a single reference.",
  },
  {
    title: "Built for repeat ordering",
    body: "Save products to a wishlist and reorder from your history in a couple of clicks.",
  },
];

export default function HomePage() {
  const departments = getDepartments();
  const featured = queryProducts({ inStockOnly: true, sort: "relevance" });
  const withTiers = featured.items.filter((p) => p.tiers.length > 0).slice(0, 8);

  return (
    <div>
      {/* Hero */}
      <section className="border-b border-border-base bg-surface">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 lg:grid-cols-2 lg:items-center lg:py-20">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-brand">
              Trade supply, UAE wide
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-text sm:text-4xl lg:text-5xl">
              Everything your clinic orders, at trade quantities
            </h1>
            <p className="mt-4 max-w-prose text-base leading-relaxed text-text-muted">
              Medical consumables, dental, laboratory, PPE and cleaning supplies
              from one account. Published volume pricing, transparent VAT, and a
              catalogue built for people who order the same things every month.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/products"
                className="rounded-card bg-brand px-5 py-3 font-medium text-on-brand transition-colors hover:bg-brand-hover"
              >
                Browse the catalogue
              </Link>
              <Link
                href="/bulk-buy"
                className="rounded-card border border-border-strong bg-surface px-5 py-3 font-medium text-text transition-colors hover:bg-surface-hover"
              >
                Request bulk pricing
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {VALUE_PROPS.map((prop) => (
              <div
                key={prop.title}
                className="rounded-panel border border-border-base bg-canvas p-4"
              >
                <h2 className="text-sm font-semibold text-text">{prop.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
                  {prop.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Departments */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight text-text">
            Shop by department
          </h2>
          <Link
            href="/products"
            className="text-sm font-medium text-brand hover:underline"
          >
            View all
          </Link>
        </div>

        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {departments.map((dept) => (
            <li key={dept.id}>
              <Link
                href={`/products?category=${dept.slug}`}
                className="flex h-full flex-col justify-between rounded-panel border border-border-base bg-surface p-4 shadow-card transition-all hover:border-brand-border hover:shadow-raised"
              >
                <span className="font-medium leading-snug text-text">
                  {dept.name}
                </span>
                <span className="mt-3 text-xs text-text-subtle tnum">
                  {dept.children.length} categories
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Volume deals */}
      {withTiers.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-text">
                Best volume breaks
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Lines where ordering by the box saves the most.
              </p>
            </div>
            <Link
              href="/products"
              className="shrink-0 text-sm font-medium text-brand hover:underline"
            >
              See all
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {withTiers.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
