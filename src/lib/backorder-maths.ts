/**
 * The arithmetic behind a back order, kept pure so it can be tested.
 *
 * Both of these decide where customer demand ends up, and getting either wrong
 * is silent: nothing throws, an order simply never arrives. They are separated
 * from the database work for that reason.
 */

/**
 * How many units of a line nobody has committed to.
 *
 * A null qtyConfirmed is NOT a shortfall. It means the supplier has not
 * answered yet, which is a chase; treating silence as a refusal would
 * re-source orders nobody declined. Zero confirmed IS a shortfall of the whole
 * line — they have answered, and the answer was none.
 *
 * Never negative: a supplier who confirms more than we asked for has not
 * created a surplus back order.
 */
export function shortfallOf(line: {
  qtyOrdered: number;
  qtyConfirmed: number | null;
}): number {
  if (line.qtyConfirmed === null) return 0;
  return Math.max(0, line.qtyOrdered - line.qtyConfirmed);
}

export type Allocation = { id: string; orderItemId: string; qty: number };

export type Move = {
  /** The allocation being drawn from. */
  id: string;
  orderItemId: string;
  /** How much to move to the new line. */
  qty: number;
  /** What is left on the original, so the caller updates or deletes it. */
  remaining: number;
};

/**
 * Take `wanted` units out of a line's allocations, largest first.
 *
 * An allocation says "these units were bought for that customer order". When a
 * shortfall moves to a new supplier the demand has to move with it, or
 * outstandingDemand keeps counting those units as covered and the customer
 * waits for something nobody is sending.
 *
 * LARGEST FIRST, so the move touches as few allocations as possible: splitting
 * one allocation of ten beats splitting ten of one, and every split is a row
 * somebody may later have to read.
 *
 * Takes whole units only, and stops when satisfied. If the allocations add up
 * to less than `wanted` — which happens when part of a line was never
 * allocated to anybody, because it was bought to stock — it moves what exists
 * and no more. The caller still orders the full shortfall; the difference is
 * simply demand that was not attached to a customer in the first place.
 */
export function takeFrom(allocations: Allocation[], wanted: number): Move[] {
  if (wanted <= 0) return [];

  const moves: Move[] = [];
  let left = wanted;

  // Sorted here rather than trusted from the caller: the maths depends on it,
  // so it should not depend on somebody remembering an orderBy.
  for (const allocation of [...allocations].sort((a, b) => b.qty - a.qty)) {
    if (left <= 0) break;
    if (allocation.qty <= 0) continue;

    const take = Math.min(allocation.qty, left);
    moves.push({
      id: allocation.id,
      orderItemId: allocation.orderItemId,
      qty: take,
      remaining: allocation.qty - take,
    });
    left -= take;
  }

  return moves;
}
