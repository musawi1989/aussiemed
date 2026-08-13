"use client";

import { useStore } from "@/lib/store";

export function WishlistButton({
  productId,
  className = "",
  withLabel = false,
}: {
  productId: number;
  className?: string;
  withLabel?: boolean;
}) {
  const { inWishlist, toggleWishlist, ready } = useStore();
  const saved = ready && inWishlist(productId);

  return (
    <button
      type="button"
      onClick={() => toggleWishlist(productId)}
      aria-pressed={saved}
      aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
      title={saved ? "Remove from wishlist" : "Save to wishlist"}
      className={`inline-flex items-center gap-2 rounded-card border transition-colors ${
        saved
          ? "border-brand-border bg-brand-soft text-brand"
          : "border-border-base bg-surface text-text-muted hover:border-border-strong hover:text-text"
      } ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden="true"
      >
        <path d="M12 20.5 4.2 12.9a4.7 4.7 0 0 1 0-6.7 4.8 4.8 0 0 1 6.8 0l1 1 1-1a4.8 4.8 0 0 1 6.8 0 4.7 4.7 0 0 1 0 6.7Z" />
      </svg>
      {withLabel && <span>{saved ? "Saved" : "Save"}</span>}
    </button>
  );
}
