"use client";

import { useTransition } from "react";
import { useStore } from "@/lib/store";
import { toggleSavedAction } from "@/app/(shop)/account/actions";

/**
 * The heart that saves a product. Buyers only.
 *
 * SHOWN TO NOBODY ELSE. Saving is an account feature, and the server only ever
 * recorded it for a Customer: a guest's heart and a supplier's heart filled in,
 * persisted nothing, and pointed at a My products screen neither of them has. A
 * control that looks like it worked and did not is worse than no control, so
 * there is now no control.
 *
 * The optimistic toggle keeps the button instant; the server action is what
 * records it, so the list follows the buyer to another device and feeds My
 * products.
 *
 * The slug is what the server is given. The browser only knows the catalogue's
 * own numeric ids, and the slug is a product's stable public address.
 */
export function WishlistButton({
  productId,
  slug,
  className = "",
  withLabel = false,
}: {
  productId: number;
  slug: string;
  className?: string;
  withLabel?: boolean;
}) {
  const { inWishlist, toggleWishlist, ready, canSave } = useStore();
  const [pending, startTransition] = useTransition();
  const saved = ready && inWishlist(productId);

  // Rendered as nothing rather than as a disabled button: there is no action
  // to explain and nothing to enable. Every caller lays this out as an
  // optional child, so it simply leaves no gap.
  if (!canSave) return null;

  const toggle = () => {
    // Optimistic: the heart fills immediately rather than after a round trip.
    toggleWishlist(productId);
    startTransition(async () => {
      await toggleSavedAction(slug);
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved products" : "Save this product"}
      title={saved ? "Remove from saved products" : "Save this product"}
      className={`inline-flex items-center gap-2 rounded-card border transition-colors disabled:opacity-70 ${
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
