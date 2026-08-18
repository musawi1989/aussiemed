/**
 * What a product list says when it has nothing to show.
 *
 * The whole Livingstone tree is now navigable (DEC-27, reversing DEC-16), and
 * most of it holds nothing until the real catalogue lands — so a buyer reaches
 * an empty page by browsing rather than by over-filtering. The two need
 * different words. "Clear all filters" is useless advice to someone who has set
 * no filters, and an empty grid under a category the site advertises reads as
 * broken rather than as not-stocked-yet.
 *
 * Kept pure and away from the page so the wording is unit tested rather than
 * eyeballed, and so the same decision cannot be made two different ways in two
 * different places.
 */

export type EmptyReason =
  /** A search term found nothing. */
  | "search"
  /** A category the site lists, with nothing filed under it yet. */
  | "category"
  /** Filters were narrowed until nothing survived. */
  | "filters"
  /** No filters at all, and still nothing — the catalogue itself is empty. */
  | "catalogue";

export type EmptyFilters = {
  category?: string;
  q?: string;
  brand?: string;
  inStock?: boolean;
};

/**
 * Only meaningful when a query returned zero products. Order matters: a search
 * term is what the buyer typed and therefore what they are thinking about, so
 * it outranks a category that happens to be selected as well.
 */
export function emptyReason(filters: EmptyFilters): EmptyReason {
  if (filters.q?.trim()) return "search";

  const narrowed = Boolean(filters.brand) || filters.inStock === true;
  if (filters.category) return narrowed ? "filters" : "category";

  return narrowed ? "filters" : "catalogue";
}

export type EmptyAction = { label: string; href: string };

export type EmptyMessage = {
  title: string;
  body: string;
  primary?: EmptyAction;
  secondary?: EmptyAction;
};

/**
 * Carries what the buyer was looking at into the enquiry form, so a request
 * from an empty category arrives in the admin queue saying which category it
 * came from instead of arriving blank.
 */
export function enquiryHref(about?: string): string {
  return about
    ? `/bulk-buy?about=${encodeURIComponent(about)}`
    : "/bulk-buy";
}

export function emptyMessage(
  reason: EmptyReason,
  context: { categoryName?: string; q?: string } = {}
): EmptyMessage {
  const name = context.categoryName?.trim();
  const term = context.q?.trim();

  switch (reason) {
    case "search":
      return {
        title: term ? `Nothing matched “${term}”` : "Nothing matched that search",
        body: "Try a shorter term or a different spelling. If we do not list it yet, ask us — a lot of what we supply is sourced to order.",
        primary: { label: "Ask us to source it", href: enquiryHref(term) },
        secondary: { label: "Browse all products", href: "/products" },
      };

    case "category":
      return {
        title: name ? `Nothing listed under ${name} yet` : "Nothing listed here yet",
        // Says plainly that the category is real and the stock is not, which is
        // the truth while the catalogue is being loaded. It does not promise a
        // lead time nobody has agreed.
        body: name
          ? `${name} is part of our range, and the products are not on the site yet. Tell us what you need and we will come back with a price.`
          : "This category is part of our range, and the products are not on the site yet. Tell us what you need and we will come back with a price.",
        primary: {
          label: name ? `Ask about ${name}` : "Tell us what you need",
          href: enquiryHref(name),
        },
        secondary: { label: "Browse all products", href: "/products" },
      };

    case "filters":
      return {
        title: "Nothing matched those filters",
        body: "Widen them, or clear them to see everything we list.",
        primary: { label: "Clear all filters", href: "/products" },
      };

    case "catalogue":
      return {
        title: "No products are listed yet",
        body: "The catalogue is still being loaded. Tell us what you need in the meantime and we will come back with a price.",
        primary: { label: "Tell us what you need", href: enquiryHref() },
      };
  }
}
