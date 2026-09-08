import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getDepartments } from "@/lib/catalog";

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

export default async function HomePage() {
  /*
   * Departments only.
   *
   * The page used to end on a grid of eight products under "Best Volume
   * Breaks". Nobody asked for it and no decision records it — it was a shop
   * front's reflex. A trade buyer arriving here is not shopping for one line,
   * they are working out whether this supplier covers what their practice
   * uses, and eight products out of thousands answers that question badly.
   * That is what the category grid is for, and it is now the whole page below
   * the hero.
   *
   * Dropping it also stopped the front page loading the entire catalogue to
   * show eight of it.
   */
  const departments = await getDepartments();
  // Every department, including the ones nothing is filed under yet. The client
  // asked on 18 Aug 2026 for the full range to be visible while the catalogue
  // is loaded (DEC-27, reversing DEC-16); an empty one lands on a page that
  // says so and invites an enquiry, rather than on a bare grid. See FN-11.
  const visibleDepartments = departments;

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

      {/*
        ---------- the range ----------

        The main event, not a section on the way to one. A buyer landing here
        is deciding whether this supplier covers what their practice gets
        through in a month, and the answer to that is the shape of the range —
        twelve departments, named — not a sample of individual products.

        Bigger tiles and four across at the widest instead of six: at six they
        read as thumbnails in a list, and the photograph is doing the work of
        saying what each department contains.
      */}
      <section className="mx-auto max-w-[1600px] px-4 py-16">
        <h2 className="section-heading text-2xl sm:text-3xl">
          Everything we supply
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-text-muted">
          Medical, dental, laboratory, cleaning and practice consumables, in
          one account and on one reference number. Every department below is
          part of the range we sell.
        </p>

        <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visibleDepartments.map((dept) => {
            const image = CATEGORY_IMAGES[dept.slug];
            return (
              <li key={dept.id}>
                <Link
                  href={`/products?category=${dept.slug}`}
                  className="group relative flex h-52 items-end overflow-hidden rounded-card shadow-card transition-shadow hover:shadow-raised"
                >
                  {image ? (
                    <Image
                      src={image}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
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

      {/* The one way through to the catalogue, which the removed product
          grid had been carrying. A page about the business still has to let
          somebody start ordering. */}
      <section className="bg-surface-sunken py-14 text-center">
        <h2 className="font-display text-xl font-bold text-text sm:text-2xl">
          Know what you need?
        </h2>
        <p className="mx-auto mt-2 max-w-xl px-4 text-text-muted">
          Search the full catalogue, or ask us for a price on a bulk order.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 px-4">
          <Link
            href="/products"
            className="rounded-card bg-navy px-7 py-3 font-bold text-on-navy transition-colors hover:bg-navy-hover"
          >
            Browse the full range
          </Link>
          <Link
            href="/bulk-buy"
            className="rounded-card border border-border-strong bg-surface px-7 py-3 font-bold text-text transition-colors hover:bg-surface-hover"
          >
            Get bulk prices
          </Link>
        </div>
      </section>
    </div>
  );
}
