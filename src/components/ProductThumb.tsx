import Image from "next/image";
import type { Product } from "@/lib/types";

/**
 * The extraction carried almost no product photography, so most products have
 * no image at all. Rather than a broken-image box or a grey rectangle, absent
 * imagery renders as a typographic tile: a monogram over a hue derived from the
 * product's department, so a category reads as visually coherent in a grid.
 *
 * This is a deliberate stand-in, not a permanent design — once real photography
 * is loaded, `images` populates and this path stops being used.
 */

function monogram(product: Product): string {
  const source = product.brand ?? product.name;
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Stable hue per department so sibling products share a family tint. */
function hueFor(product: Product): number {
  const seed = product.categoryPath[0]?.id ?? product.id;
  return (seed * 47) % 360;
}

const MONOGRAM_SIZE = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-6xl",
} as const;

export function ProductThumb({
  product,
  className = "",
  sizes = "(max-width: 768px) 50vw, 25vw",
  priority = false,
  size = "md",
}: {
  product: Product;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** Scales the fallback monogram to the tile it sits in. */
  size?: keyof typeof MONOGRAM_SIZE;
}) {
  const image = product.images[0];

  if (image) {
    return (
      <div
        className={`relative overflow-hidden bg-surface-sunken ${className}`}
      >
        <Image
          src={image}
          alt={product.name}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      </div>
    );
  }

  // Only the hue is per-product; saturation and lightness come from theme
  // tokens so these tiles invert properly in dark mode.
  const hueVar = { "--thumb-h": hueFor(product) } as React.CSSProperties;

  return (
    <div
      className={`product-thumb relative flex items-center justify-center overflow-hidden ${className}`}
      style={hueVar}
      aria-hidden="true"
    >
      {/* Faint grid, echoing lab/graph paper — keeps the tile from reading empty */}
      <div className="product-thumb-grid absolute inset-0 opacity-50" />
      <span
        className={`product-thumb-ink relative font-semibold tracking-tight tnum ${MONOGRAM_SIZE[size]}`}
      >
        {monogram(product)}
      </span>
    </div>
  );
}
