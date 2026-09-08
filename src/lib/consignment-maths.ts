/** The current box counts as packed; other boxes count only once dispatched. */
export function includedInPackingList(
  batch: { sequence: number; dispatchedAt?: Date | null },
  sequence: number,
  asOf: Date,
): boolean {
  return batch.sequence === sequence || Boolean(batch.dispatchedAt && batch.dispatchedAt <= asOf);
}
