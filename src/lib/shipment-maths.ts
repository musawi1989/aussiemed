/**
 * What is still owed on an order, and what a proposed despatch would do to it.
 *
 * Pure, and its own module for the same reason backorder-maths.ts is: this is
 * the part that must be right, and a function that reaches the database can
 * only be tested by building an order first. Everything here is arithmetic over
 * plain numbers, so the awkward cases — a line part-shipped twice, a cancelled
 * line, a despatch for more than is owed — can be written down as tests instead
 * of being discovered on a customer's delivery.
 *
 * ONE RULE UNDERNEATH ALL OF IT: a line's outstanding quantity is what was
 * ordered minus the sum of every shipment line against it. Never a status flag.
 * A status says "Shipped" whether one unit went or sixty, and the whole point
 * of splitting an order into batches is that those are different answers.
 */

export type OrderLineForShipping = {
  id: string;
  name: string;
  skuCode: string;
  unitLabel: string;
  qty: number;
  /** Pending | Allocated | Picked | Packed | Shipped | Backordered | Cancelled */
  status: string;
  /** Total already sent across every earlier shipment. */
  shipped: number;
  reserved?: number;
};

export type ShippingPlanLine = OrderLineForShipping & {
  /** Ordered minus shipped, floored at zero. Zero for a cancelled line. */
  outstanding: number;
  /** True when this line has nothing left to send. */
  settled: boolean;
};

/**
 * A cancelled line is not owed and never appears on a packing list.
 *
 * Not merely cosmetic: counting it as outstanding would keep the order looking
 * unfulfilled forever, so the "everything has gone" test would never fire and
 * somebody would keep making empty packing lists for it.
 */
export const CANCELLED = "Cancelled";

export function planLines(
  lines: OrderLineForShipping[]
): ShippingPlanLine[] {
  return lines.map((line) => {
    const outstanding =
      line.status === CANCELLED ? 0 : Math.max(0, line.qty - line.shipped - (line.reserved ?? 0));
    return { ...line, outstanding, settled: outstanding === 0 };
  });
}

/** Nothing left to send on any line. */
export function isFullyShipped(lines: OrderLineForShipping[]): boolean {
  return lines.every(line => line.status === CANCELLED || line.shipped >= line.qty);
}

/**
 * Whether anything has gone at all.
 *
 * Distinguishes "not despatched yet" from "part-despatched", which the order
 * screen needs in order to say something true in both cases.
 */
export function hasShipped(lines: OrderLineForShipping[]): boolean {
  return lines.some((line) => line.shipped > 0);
}

export type ProposedLine = { orderItemId: string; qty: number };

export type ShipmentCheck =
  | { ok: true; lines: ProposedLine[] }
  | { ok: false; error: string };

/**
 * Validates a despatch before anything is written.
 *
 * Refuses rather than clamps. Silently reducing 80 to the 60 that are owed
 * would produce a packing list that disagrees with what the packer typed, and
 * they would find out when the customer counted the box. The number in the form
 * is a claim about what is physically going, so a claim that cannot be true is
 * a question for a person.
 */
export function checkShipment(
  lines: OrderLineForShipping[],
  proposed: ProposedLine[]
): ShipmentCheck {
  if (proposed.some(line => !Number.isSafeInteger(line.qty) || line.qty < 0)) return { ok: false, error: "Shipment quantities must be whole numbers of zero or more." };
  const plan = new Map(planLines(lines).map((line) => [line.id, line]));

  // Zero and blank are how a packer says "not this one", so they are dropped
  // rather than refused — an order of forty lines despatching two would
  // otherwise be thirty-eight error messages.
  const wanted = proposed.filter((line) => line.qty > 0);

  if (wanted.length === 0) {
    return { ok: false, error: "Nothing is on this packing list yet — enter a quantity against at least one line." };
  }

  const seen = new Set<string>();
  for (const line of wanted) {
    const target = plan.get(line.orderItemId);
    if (!target) {
      return { ok: false, error: "That order line is not on this order any more. Reload and try again." };
    }
    if (seen.has(line.orderItemId)) {
      return { ok: false, error: `${target.name} appears twice on this packing list.` };
    }
    seen.add(line.orderItemId);

    if (!Number.isInteger(line.qty)) {
      return { ok: false, error: `${target.name}: a despatch has to be a whole number of ${target.unitLabel}.` };
    }
    if (target.status === CANCELLED) {
      return { ok: false, error: `${target.name} was cancelled, so it cannot be sent.` };
    }
    if (line.qty > target.outstanding) {
      return {
        ok: false,
        error:
          target.outstanding === 0
            ? `${target.name} has already been sent in full.`
            : `${target.name}: only ${target.outstanding} of ${target.qty} ${target.qty === 1 ? "is" : "are"} still owed, so ${line.qty} cannot go.`,
      };
    }
  }

  return { ok: true, lines: wanted };
}

/**
 * What a line's status becomes once a despatch is recorded.
 *
 * A part-shipped line does NOT become Shipped. It is the case the whole feature
 * exists for, and calling it shipped is how the remainder gets forgotten — the
 * order looks complete, drops off every queue, and the twenty boxes still owed
 * are remembered only by the customer.
 *
 * Backordered is preserved on a part-shipped line, because it is still true and
 * it is the word the back-order screens filter on. A line that was Backordered
 * and has now gone in full is simply Shipped: it stopped being a back order the
 * moment it left.
 */
export function statusAfterShipping(
  line: OrderLineForShipping,
  justShipped: number
): string {
  if (line.status === CANCELLED) return CANCELLED;

  const shipped = line.shipped + justShipped;
  if (shipped >= line.qty) return "Shipped";
  if (line.status === "Backordered") return "Backordered";
  // Something has gone but not all of it. There is no "PartiallyShipped" in
  // the status vocabulary and inventing one here would put a word on the
  // customer's order screen that no other part of the system understands.
  return shipped > 0 ? "Packed" : line.status;
}

/**
 * Statuses an order passes through, in order, so "further along" is answerable.
 *
 * Cancelled is deliberately absent: it is not a point on this line, it is a
 * departure from it, and giving it a position would let something compare it
 * to Delivered and pick a winner.
 */
const ORDER_PROGRESSION = ["Pending", "Processing", "Dispatched", "Delivered"];

/**
 * The order's own status once a despatch is recorded.
 *
 * ONLY EVER FORWARD, AND ONLY WHEN EVERYTHING HAS GONE. Two separate rules,
 * and the second one was learned the hard way: recording a despatch against an
 * order already marked Delivered pushed it *back* to Dispatched, because the
 * only test was "is it finished". An order that has arrived has also been
 * dispatched, so the later word is the true one and moving to the earlier one
 * tells the customer their delivered order is in transit.
 *
 * A part-despatched order stays where it is regardless. Telling a customer
 * their order has been dispatched while half of it sits on a shelf is the most
 * annoying thing this feature could do, and it would do it on every order that
 * has ever had a back order.
 */
export function orderStatusAfterShipping(
  current: string,
  lines: OrderLineForShipping[]
): string {
  if (current === "Cancelled") return current;
  if (!isFullyShipped(lines)) return current;

  const at = ORDER_PROGRESSION.indexOf(current);
  const dispatched = ORDER_PROGRESSION.indexOf("Dispatched");

  // An unrecognised status is left alone rather than guessed at. Somebody has
  // added a word to the vocabulary and this is not the place to decide where
  // it sits.
  if (at === -1) return current;

  return at < dispatched ? "Dispatched" : current;
}
