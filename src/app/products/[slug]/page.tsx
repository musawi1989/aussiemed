import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyBox } from "@/components/BuyBox";
import { ProductCard } from "@/components/ProductCard";
import { ProductThumb } from "@/components/ProductThumb";
import {
  getAllProducts,
  getProductBySlug,
  relatedProducts,
} from "@/lib/catalog";
import type { Product } from "@/lib/types";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return getAllProducts().map((product) => ({ slug: product.slug }));
}

/** Truncates on a word boundary so a title or description never ends mid-word. */
function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** ~60 char title, ~155 char description, built from the product itself. */
function metaFor(product: Product) {
  // Most product names already lead with the brand ("Omron HEM7156T ..."),
  // so only prefix it when it is actually missing.
  const leadsWithBrand =
    product.brand !== null &&
    product.name.toLowerCase().startsWith(product.brand.toLowerCase());
  const title = clamp(
    product.brand && !leadsWithBrand
      ? `${product.brand} ${product.name}`
      : product.name,
    60
  );

  const category = product.categoryPath.at(-1)?.name;
  const suffix = category
    ? ` Trade pricing on ${category.toLowerCase()} in AED, excluding 5% VAT.`
    : " Trade pricing in AED, excluding 5% VAT.";

  const base =
    product.description?.split(". ")[0] ??
    `${product.name} available in trade quantities from AussieMed`;

  // Budget the lead sentence so the trailing clause always survives intact.
  const lead = clamp(base, Math.max(40, 155 - suffix.length - 1));
  const description = `${lead}${lead.endsWith("…") ? "" : "."}${suffix}`;

  return { title, description };
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return { title: "Product not found" };

  const { title, description } = metaFor(product);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: product.images.length > 0 ? product.images : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const related = relatedProducts(product);
  const category = product.categoryPath.at(-1);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-brand">
              Home
            </Link>
          </li>
          {product.categoryPath.map((node) => (
            <li key={node.id} className="flex items-center gap-1.5">
              <span aria-hidden="true">/</span>
              <Link
                href={`/products?category=${node.slug}`}
                className="hover:text-brand"
              >
                {node.name}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div>
          <div className="grid gap-3 sm:grid-cols-[5rem_1fr]">
            {product.images.length > 1 && (
              <div className="order-2 flex gap-3 sm:order-1 sm:flex-col">
                {product.images.map((src) => (
                  <div
                    key={src}
                    className="relative aspect-square w-20 overflow-hidden rounded-card border border-border-base"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
            <ProductThumb
              product={product}
              priority
              size="lg"
              sizes="(max-width: 1024px) 100vw, 50vw"
              className={`aspect-[4/3] w-full rounded-panel border border-border-base ${
                product.images.length > 1 ? "order-1 sm:order-2" : "sm:col-span-2"
              }`}
            />
          </div>

          <div className="mt-6">
            {product.brand && (
              <p className="text-sm font-medium uppercase tracking-wide text-text-subtle">
                {product.brand}
              </p>
            )}
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text sm:text-3xl">
              {product.name}
            </h1>

            <p className="mt-2 text-sm font-semibold text-text-subtle tnum">
              Item No: {product.sku}
            </p>

            {product.description && (
              <div className="mt-6 border-t border-border-base pt-5">
                <h2 className="text-base font-bold text-text">Description</h2>
                <p className="mt-2 max-w-prose leading-relaxed text-text-muted">
                  {product.description}
                </p>
              </div>
            )}

            {/* Structured specs. Trade buyers check standards, materials and
                pack sizes before ordering — and these become filters later. */}
            {product.attributes.length > 0 && (
              <div className="mt-6 border-t border-border-base pt-5">
                <h2 className="text-base font-bold text-text">Details</h2>
                <dl className="mt-3 overflow-hidden rounded-card border border-border-base">
                  {product.attributes.map((attr, i) => (
                    <div
                      key={attr.label}
                      className={`flex gap-4 px-4 py-2.5 text-sm ${
                        i % 2 === 0 ? "bg-surface-sunken" : "bg-surface"
                      }`}
                    >
                      <dt className="w-40 shrink-0 font-semibold text-text-muted">
                        {attr.label}
                      </dt>
                      <dd className="text-text">{attr.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Safety data sheets and spec sheets. For laboratory and medical
                buyers an SDS is frequently a compliance requirement, not a
                nicety — the section stays hidden until real files exist. */}
            {product.documents.length > 0 && (
              <div className="mt-6 border-t border-border-base pt-5">
                <h2 className="text-base font-bold text-text">Documents</h2>
                <ul className="mt-3 space-y-2">
                  {product.documents.map((doc) => (
                    <li key={doc.href}>
                      <a
                        href={doc.href}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-navy hover:underline"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                          <path d="M6 3h8l4 4v14H6z" />
                          <path d="M14 3v4h4" />
                        </svg>
                        {doc.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {product.isPlaceholder && (
              <p className="mt-5 rounded-card border border-accent-border bg-accent-soft px-3 py-2 text-sm text-accent">
                Placeholder catalogue entry — seed data for the rebuild, not a
                real product listing.
              </p>
            )}

            {product.sourceNote && (
              <p className="mt-3 rounded-card border border-border-base bg-surface-sunken px-3 py-2 text-xs text-text-muted">
                Extraction note: {product.sourceNote}
              </p>
            )}
          </div>
        </div>

        <div className="lg:sticky lg:top-40 lg:self-start">
          <BuyBox product={product} />
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-text">
            Others in {category?.name ?? "this category"}
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
