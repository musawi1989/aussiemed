import type { Product, ProductBadge } from "@/lib/types";

/**
 * Merchandising flags. "Back soon" replaces a bare "Out of stock" wherever the
 * line is expected to return — it tells a buyer to wait rather than go
 * elsewhere, which for a repeat trade customer is the difference between a
 * delayed order and a lost one.
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
  const badges = [...product.badges];

  // Out of stock only shows when nothing softer already explains the absence.
  const showOutOfStock =
    product.outOfStock && !badges.includes("back-soon");

  if (badges.length === 0 && !showOutOfStock) return null;

  return (
    <div className="flex flex-col items-start gap-1">
      {showOutOfStock && (
        <span className="rounded bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">
          Out of stock
        </span>
      )}
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
