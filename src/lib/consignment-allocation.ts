/** Allocate just this consignment against the remaining buyer quantities. */
export function allocateConsignment<T extends { qty: number }>(
  allocations: readonly T[],
  previouslySent: number,
  quantity: number,
): { allocations: T[]; unallocated: number } {
  let skip = Math.max(0, previouslySent);
  let left = quantity;
  const result: T[] = [];
  for (const allocation of allocations) {
    const prior = Math.min(skip, allocation.qty);
    skip -= prior;
    const qty = Math.min(left, allocation.qty - prior);
    if (qty > 0) result.push({ ...allocation, qty });
    left -= qty;
    if (left === 0) break;
  }
  return { allocations: result, unallocated: left };
}
