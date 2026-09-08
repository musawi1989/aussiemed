"use client";

import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";

/**
 * Chooses between the sizes of one product family.
 *
 * The 375ml and the 60ml are separate products with their own SKUs, stock and
 * prices — they are not options on a single product. That is a fact about the
 * data, not about the interface, and it used to leak into the interface: every
 * picker navigated, so changing size while browsing a grid threw the shopper
 * out of the grid and onto a product page they had not asked for.
 *
 * TWO BEHAVIOURS, CHOSEN BY THE CALLER, because the right answer genuinely
 * differs:
 *
 *   - On a CARD in a listing, `onSelect` is given and the card swaps what it
 *     shows. Nothing navigates; the shopper keeps their place, their scroll
 *     position and the rest of the grid.
 *
 *   - On a PRODUCT PAGE, no `onSelect` is given and it navigates, because the
 *     page is about one product. Swapping in place there would leave the URL
 *     describing something other than what is on screen, so sharing the link
 *     or reloading would show a different size than the one being looked at.
 *
 * Every member of the family carries the same picker, so a buyer who lands on
 * the wrong size never has to search again.
 */
export function VariantPicker({
  product,
  size = "md",
  onSelect,
  /** The slug currently shown, when the caller is swapping in place. */
  value,
}: {
  product: Product;
  size?: "sm" | "md";
  onSelect?: (slug: string) => void;
  value?: string;
}) {
  const router = useRouter();
  const members = product.familyMembers ?? [];

  if (members.length < 2) return null;

  const height = size === "sm" ? "h-8 text-xs" : "h-11 text-sm";
  const current = value ?? product.slug;

  return (
    <label className="block">
      <span
        className={`mb-1 block font-bold text-text ${
          size === "sm" ? "text-xs" : "text-sm"
        }`}
      >
        Related variants
        <span className="ml-1 font-normal text-text-muted">
          ({members.length} available)
        </span>
      </span>
      <select
        value={current}
        onChange={(e) => {
          const slug = e.target.value;
          if (onSelect) onSelect(slug);
          else router.push(`/products/${slug}`);
        }}
        aria-label={`Choose a variant of ${product.name}`}
        className={`w-full rounded-card border border-border-strong bg-surface px-2 font-semibold text-text ${height}`}
      >
        {/* No stock note beside a size. Every member of the family reads the
            same whether we hold it or not — see ProductBadges. */}
        {members.map((member) => (
          <option key={member.slug} value={member.slug}>
            {member.label}
          </option>
        ))}
      </select>
    </label>
  );
}
