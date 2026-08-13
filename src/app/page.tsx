import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { getDepartments, queryProducts } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "AussieMed — One-Stop Online Medical Supply Partner",
  description:
    "Trade supplier of medical, dental, laboratory and cleaning consumables across the UAE. Volume price breaks on every line, priced in AED excluding 5% VAT.",
};

/** Department slug -> the brand's own category photograph. */
const CATEGORY_IMAGES: Record<string, string> = {
  "medical-consumables": "/categories/medical-consumables.png",
  "wound-care-first-aid-and-safety":
    "/categories/wound-care-first-aid-and-safety.jpg",
  kitchen: "/categories/kitchen.jpg",
  laboratory: "/categories/laboratory.jpg",
  "protective-wear-ppe": "/categories/protective-wear-ppe.jpg",
  "beauty-skin-and-personal-care":
    "/categories/beauty-skin-and-personal-care.png",
  "instruments-and-diagnostics": "/categories/instruments-and-diagnostics.jpg",
  dental: "/categories/dental.jpg",
  "cleaning-and-hygiene": "/categories/cleaning-and-hygiene.png",
  "office-and-stationery-supplies":
    "/categories/office-and-stationery-supplies.jpg",
  "pet-care": "/categories/pet-care.jpg",
};

const PROMISES = [
  {
    title: "Volume pricing on every line",
    body: "Price breaks are published on the product page, not held back behind a quote request.",
  },
  {
    title: "One reference number per order",
    body: "Order across multiple suppliers and track it all under a single reference.",
  },
  {
    title: "Built for repeat ordering",
    body: "Reorder from your history in a couple of taps, and save what you buy often.",
  },
];

export default function HomePage() {
  const departments = getDepartments();
  const featured = queryProducts({ inStockOnly: true, sort: "relevance" });
  const withTiers = featured.items.filter((p) => p.tiers.length > 0).slice(0, 8);

  return (
    <div>
      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden bg-navy">
        {/*
          STAND-IN IMAGE. The live hero is Content/Banner/July-2026/u1oannrj.png,
          which the extraction never captured — only the Brand, Category,
          Product and WebHtml folders were mirrored. This is a genuine AussieMed
          CMS image standing in until the real banner is supplied.
        */}
        <Image
          src="/brand/hero.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-right"
        />
        {/* Navy fade from the left so white type stays legible over the photo,
            matching the original hero treatment. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(100deg, #29387d 0%, rgba(41,56,125,0.94) 30%, rgba(41,56,125,0.62) 52%, rgba(41,56,125,0.2) 78%, rgba(41,56,125,0.08) 100%)",
          }}
        />

        <div className="relative mx-auto max-w-[1600px] px-4 py-20 lg:py-28">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-white/90 sm:text-base">
            One-Stop Online Medical Supply Partner
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-[1.08] text-white sm:text-5xl lg:text-6xl">
            Empowering Better Care Through Reliable Supply&hellip;
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/85 sm:text-lg">
            From clinics to hospitals, we provide the essentials that keep
            healthcare moving.
          </p>
          <Link
            href="/products"
            className="mt-8 inline-block rounded-card bg-red px-7 py-3 font-bold text-on-red transition-colors hover:bg-red-hover"
          >
            Order Now
          </Link>
        </div>
      </section>

      {/* ---------- order by category ---------- */}
      <section className="mx-auto max-w-[1600px] px-4 py-16">
        <h2 className="section-heading text-2xl sm:text-3xl">
          Order By Category
        </h2>

        <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {departments.map((dept) => {
            const image = CATEGORY_IMAGES[dept.slug];
            return (
              <li key={dept.id}>
                <Link
                  href={`/products?category=${dept.slug}`}
                  className="group relative flex h-40 items-end overflow-hidden rounded-card shadow-card transition-shadow hover:shadow-raised"
                >
                  {image ? (
                    <Image
                      src={image}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 16vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-navy" />
                  )}
                  {/* Navy wash so white type stays legible over any photo. */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(41,56,125,0.15) 0%, rgba(41,56,125,0.55) 55%, rgba(4,9,34,0.88) 100%)",
                    }}
                  />
                  <span className="relative flex w-full items-center gap-2 p-3">
                    <span className="h-7 w-1 shrink-0 rounded-full bg-red" />
                    <span className="font-display text-sm font-bold leading-tight text-white">
                      {dept.name}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------- promises ---------- */}
      <section className="bg-surface-sunken py-14">
        <div className="mx-auto grid max-w-[1600px] gap-5 px-4 sm:grid-cols-3">
          {PROMISES.map((promise) => (
            <div
              key={promise.title}
              className="rounded-card border-l-4 border-red bg-surface p-5 shadow-card"
            >
              <h3 className="font-display text-base font-bold text-text">
                {promise.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {promise.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- volume deals ---------- */}
      {withTiers.length > 0 && (
        <section className="mx-auto max-w-[1600px] px-4 py-16">
          <h2 className="section-heading text-2xl sm:text-3xl">
            Best Volume Breaks
          </h2>
          <p className="mt-3 text-center text-text-muted">
            Lines where ordering by the box saves the most.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {withTiers.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/products"
              className="inline-block rounded-card bg-navy px-7 py-3 font-bold text-on-navy transition-colors hover:bg-navy-hover"
            >
              View the full range
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
