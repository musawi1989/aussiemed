import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { formatAED } from "@/lib/money";
import { savedProducts } from "@/lib/account";

export const metadata: Metadata = {
  title: "My products",
  description:
    "The AussieMed products you have saved, grouped by what they are.",
};

const aed = (fils: number) => formatAED(fils / 100);

/**
 * My products — everything this buyer has saved.
 *
 * Grouped by the category each product belongs to, using the deepest one:
 * "Gloves" is what someone browses by, "Medical Consumables" is not. Only
 * categories with something in them appear, because a list of empty headings
 * is the catalogue tree pretending to be a personal list.
 */
export default async function MyProductsPage() {
  const groups = await savedProducts();
  const total = groups.reduce((n, g) => n + g.products.length, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-text">
            My products
          </h2>
          <p className="mt-1 text-sm text-text-muted tnum">
            {total === 0
              ? "Nothing saved yet"
              : `${total} saved across ${groups.length} ${groups.length === 1 ? "category" : "categories"}`}
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="mt-5 rounded-card border border-border-base bg-surface px-4 py-12 text-center shadow-card">
          <p className="text-sm text-text-muted">
            Save a product and it appears here, filed under whatever it is.
          </p>
          <Link
            href="/products"
            className="mt-5 inline-block rounded-card bg-brand px-5 py-2.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover"
          >
            Browse the catalogue
          </Link>
        </div>
      ) : (
        <div className="mt-5 space-y-7">
          {groups.map((group) => (
            <section key={group.categoryId ?? "none"}>
              <h3 className="text-sm font-bold uppercase tracking-wide text-text-subtle">
                {group.categoryName}{" "}
                <span className="tnum text-text-muted">
                  ({group.products.length})
                </span>
              </h3>

              <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.products.map((product) => (
                  <li key={product.id}>
                    <Link
                      href={`/products/${product.slug}`}
                      className="flex h-full gap-3 rounded-card border border-border-base bg-surface p-3 shadow-card transition-colors hover:border-navy-border"
                    >
                      <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-card bg-surface-sunken">
                        {product.image && (
                          <Image
                            src={product.image}
                            alt=""
                            fill
                            sizes="64px"
                            className="object-contain"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug text-text">
                          {product.name}
                        </span>
                        <span className="mt-1 block text-sm font-bold tnum text-text">
                          {product.outOfStock ? (
                            <span className="text-danger">Out of stock</span>
                          ) : product.priceFils !== null ? (
                            aed(product.priceFils)
                          ) : (
                            ""
                          )}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
