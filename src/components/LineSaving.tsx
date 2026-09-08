import { formatAED } from "@/lib/money";
import {
  discountLabel,
  lineDiscount,
  type DiscountableLine,
} from "@/lib/order-discounts";

/**
 * What one line's discount looks like, everywhere it is shown.
 *
 * The cart, the checkout summary, the customer's order, the order
 * confirmation and the tax invoice all show the same fact, and before this it
 * was written five times or not at all. Five copies of a sentence about money
 * is five chances for one of them to say something the others do not — and
 * the one that disagrees will be the one a customer is holding.
 *
 * NO "SAVED AED 0.00". A line with nothing to report renders nothing at all,
 * including a line from an order placed before list prices were snapshotted,
 * where the honest answer is silence rather than a zero. The decision lives in
 * order-discounts.ts, where it is tested; this only draws it.
 *
 * A plain server component — no state, no hooks — so it works inside the print
 * documents as readily as in the cart.
 */
export function LineSaving({
  line,
  /**
   * The rate the account is on. Without it the percentage is worked back from
   * this line, and rounding makes an agreed 2.5% read as 2.52% — see
   * discountLabel, where the reason is written out.
   */
  accountBasisPoints,
  /** `struck` also shows the list price with a line through it. */
  struck = false,
  className = "",
}: {
  line: DiscountableLine;
  accountBasisPoints?: number;
  struck?: boolean;
  className?: string;
}) {
  const discount = lineDiscount(line);
  const label = discountLabel(discount, accountBasisPoints);
  if (!label) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {struck && discount.discounted && discount.listUnitPriceFils !== null && (
        <span className="text-text-subtle line-through tnum">
          {formatAED(discount.listUnitPriceFils / 100)}
        </span>
      )}
      <span className="font-bold text-accent">{label}</span>
    </span>
  );
}
