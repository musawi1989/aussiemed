import type { Product, ProductBadge } from "@/lib/types";

/**
 * Merchandising flags.
 *
 * STOCK IS NOT ONE OF THEM. Whether we hold a line is ours to know: a buyer who
 * reads "out of stock" goes elsewhere, while one who orders it gives us the
 * chance to offer something we do have. So the badge is gone, "Back soon" with
 * it, and nothing here distinguishes a line we hold from one we do not.
 *
 * The flag itself is untouched — still set by the admin and the supplier
 * portal, still shown on every staff screen. It simply does not travel to the
 * shop. See the note on ProductCard and BuyBox for the rest of it.
 */
const STYLES: Record<ProductBadge, { label: string; className: string }> = {
  "top-seller": {
    label: "Top seller",
    className: "bg-navy text-on-navy",
  },
  new: {
    label: "New",
    className: "bg-success text-white",
  },
  "back-soon": {
    label: "Back soon",
    className: "bg-accent-soft text-accent border border-accent-border",
  },
  clearance: {
    label: "Clearance",
    className: "bg-red text-on-red",
  },
};

export function ProductBadges({ product }: { product: Product }) {
  // "Back soon" is dropped along with the out-of-stock badge: it says the same
  // thing in a friendlier voice, and a buyer told to wait is a buyer told we
  // have not got it.
  const badges = product.badges.filter((badge) => badge !== "back-soon");

  if (badges.length === 0 && product.taxClass !== "zero-rated") return null;

  return (
    <div className="flex flex-col items-start gap-1">
      {badges.map((badge) => (
        <span
          key={badge}
          className={`rounded px-2 py-0.5 text-[11px] font-bold ${STYLES[badge].className}`}
        >
          {STYLES[badge].label}
        </span>
      ))}
      {product.taxClass === "zero-rated" && (
        <span className="rounded bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success">
          VAT free
        </span>
      )}
    </div>
  );
}
