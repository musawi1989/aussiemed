import { NotFoundContent } from "@/components/NotFoundContent";

/**
 * notFound() thrown inside the storefront — an unlisted product, an order
 * reference that is not yours.
 *
 * No chrome here: this renders inside the (shop) layout, which has already
 * supplied the header and footer. Without this file the root not-found would
 * be used instead, and because that one carries its own chrome for unmatched
 * URLs, the page came out with two headers and two footers.
 */
export default function ShopNotFound() {
  return <NotFoundContent />;
}
