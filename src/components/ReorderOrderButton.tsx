"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getProductById } from "@/lib/catalog";
import { useStore } from "@/lib/store";

/**
 * Repeats a whole past order in one action. Out-of-stock lines are skipped
 * rather than silently dropped — the count is reported back to the buyer.
 */
export function ReorderOrderButton({
  lines,
}: {
  lines: { productId: number; qty: number }[];
}) {
  const { addToCart } = useStore();
  const router = useRouter();
  const [skipped, setSkipped] = useState<number | null>(null);

  const handle = () => {
    let unavailable = 0;
    for (const line of lines) {
      const product = getProductById(line.productId);
      if (!product || product.outOfStock) {
        unavailable += 1;
        continue;
      }
      addToCart(line.productId, product.defaultPackId, line.qty);
    }

    if (unavailable > 0) {
      setSkipped(unavailable);
      return;
    }
    router.push("/cart");
  };

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={handle}
        className="rounded-card bg-brand px-4 py-2 text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
      >
        Reorder everything
      </button>
      {skipped !== null && (
        <p className="mt-2 max-w-56 text-xs leading-relaxed text-accent tnum">
          Added what&rsquo;s available. {skipped}{" "}
          {skipped === 1 ? "line is" : "lines are"} out of stock and{" "}
          {skipped === 1 ? "was" : "were"} skipped.
        </p>
      )}
    </div>
  );
}
