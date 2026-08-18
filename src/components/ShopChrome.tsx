import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CutoffBar } from "@/components/CutoffBar";
import { cutoffState } from "@/lib/cutoff";
import { getCutoffHour } from "@/lib/purchasing";
import { getDepartments, productIdsForSlugs } from "@/lib/catalog";
import { savedProductSlugs } from "@/lib/account";
import { CatalogProvider } from "@/lib/catalog-client";
import { getSessionUser } from "@/lib/auth";
import { CartProvider } from "@/lib/cart-client";
import { StoreProvider } from "@/lib/store";

/**
 * The storefront's furniture: header, footer and the providers a shopper needs.
 *
 * This is a component rather than only the (shop) layout because the root
 * not-found also needs it. An unmatched URL is handled above every route group,
 * so it cannot inherit a layout from inside one, and a 404 with no header is a
 * dead end — the visitor mistyped an address and we would be taking the
 * navigation away at exactly the moment they need it.
 *
 * Nothing here is loaded for /admin or /business-portal. The whole catalogue
 * used to be fetched and pushed into a browser-side provider on every request
 * in the app, including a page showing a table of orders.
 */
export async function ShopChrome({
  children,
  withCatalogue = true,
}: {
  children: React.ReactNode;
  /**
   * Whether this chrome belongs to a signed-in shopper's page.
   *
   * It no longer decides whether the CATALOGUE travels with the render, because
   * nothing does: the catalogue is fetched once by the browser and cached, and
   * shipping it as well took the home page HTML to 1.47MB at 2,057 products
   * while the fetch pulled the same 1.1MB again. BE-47 caught that shape of bug
   * in the admin; this is the storefront's version of it.
   *
   * What it still controls is the saved-products lookup, which is a database
   * read the root not-found boundary has no business doing — Next includes that
   * boundary in the payload of every page, admin ones included.
   */
  withCatalogue?: boolean;
}) {
  const [departments, user, savedSlugs, cutoffHour] = await Promise.all([
    getDepartments(),
    getSessionUser(),
    withCatalogue ? savedProductSlugs() : Promise.resolve([]),
    getCutoffHour(),
  ]);

  // Computed here so every page agrees, and from the same pure module the
  // buying run uses — a countdown that disagreed with the run would be a
  // promise broken by arithmetic.
  const cutoff = cutoffState(new Date(), cutoffHour);

  // Translated here because the browser works in catalogue ids and the
  // database works in slugs. Doing it once on the server keeps that seam out
  // of every component with a heart on it — and only the ids travel, not the
  // catalogue they were looked up in.
  const savedProductIds = await productIdsForSlugs(savedSlugs);

  return (
    <CatalogProvider initialProducts={[]}>
      <CartProvider>
        <StoreProvider savedProductIds={savedProductIds}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-card focus:bg-brand focus:px-4 focus:py-2 focus:text-on-brand"
          >
            Skip to content
          </a>
          <Header
            departments={departments}
            sessionUser={user ? { name: user.name, role: user.role } : null}
          />
          {/* Directly under the header, on every storefront page. The cutoff
              is the one thing a trade buyer needs to know before they decide
              whether to order now or in the morning, so it is not somewhere
              they have to go and find. */}
          <CutoffBar
            cutoffAtMs={cutoff.nextAt.getTime()}
            label={cutoff.label}
            today={cutoff.today}
          />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </StoreProvider>
      </CartProvider>
    </CatalogProvider>
  );
}
