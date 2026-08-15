import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getAllProducts, getDepartments } from "@/lib/catalog";
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
export async function ShopChrome({ children }: { children: React.ReactNode }) {
  const [departments, products, user] = await Promise.all([
    getDepartments(),
    getAllProducts(),
    getSessionUser(),
  ]);

  return (
    <CatalogProvider initialProducts={products}>
      <CartProvider>
        <StoreProvider>
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
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </StoreProvider>
      </CartProvider>
    </CatalogProvider>
  );
}
