"use client";

import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";

/**
 * Jumps between the sizes of one product family.
 *
 * The 375ml and the 60ml are separate products with their own SKUs, stock and
 * prices — they are not options on a single product. So this navigates rather
 * than mutating state, and every member of the family carries the same
 * dropdown, meaning a buyer who lands on the wrong size never has to search
 * again.
 */
export function VariantPicker({
  product,
  size = "md",
}: {
  product: Product;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const members = product.familyMembers ?? [];

  if (members.length < 2) return null;

  const height = size === "sm" ? "h-8 text-xs" : "h-11 text-sm";

  return (
    <label className="block">
      <span
        className={`mb-1 block font-bold text-text ${
          size === "sm" ? "text-xs" : "text-sm"
        }`}
      >
        Size / volume
        <span className="ml-1 font-normal text-text-muted">
          ({members.length} available)
        </span>
      </span>
      <select
        value={product.slug}
        onChange={(e) => router.push(`/products/${e.target.value}`)}
        aria-label={`Choose a size of ${product.name}`}
        className={`w-full rounded-card border border-border-strong bg-surface px-2 font-semibold text-text ${height}`}
      >
        {members.map((member) => (
          <option key={member.slug} value={member.slug}>
            {member.label}
            {member.outOfStock ? " — out of stock" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
