import { ShopChrome } from "@/components/ShopChrome";
import { NotFoundContent } from "@/components/NotFoundContent";

/**
 * URLs that match no route at all.
 *
 * These are resolved above every route group, so this cannot inherit the
 * storefront layout and has to put the chrome on itself. A visitor who
 * mistyped an address needs the navigation more than anyone, not less.
 *
 * notFound() thrown from inside the storefront is handled by
 * (shop)/not-found.tsx, which deliberately has no chrome — it already sits
 * inside the shop layout.
 */
export default function NotFound() {
  return (
    <ShopChrome>
      <NotFoundContent />
    </ShopChrome>
  );
}
