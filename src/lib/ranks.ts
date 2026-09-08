/**
 * The cover slots: who we buy each pack from, in order of preference.
 *
 * Its own module, pure, and importing nothing. Three different kinds of caller
 * need this list and they cannot all have it from the same place otherwise:
 *
 *  - supply-cover.ts is `server-only` — it reaches the database
 *  - purchase-plan.ts is pure so a plan can be unit tested without one
 *  - the admin screens are "use client", and a client component importing
 *    anything `server-only` fails the build
 *
 * It lived in supply-cover.ts until the third slot arrived, at which point a
 * client component needed the labels and the only alternatives were to
 * duplicate the list or to leak the service layer into the browser. Duplicated
 * lists of ranks go out of step silently — the symptom is "the third supplier
 * is never used", which nothing reports.
 *
 * "Backup" is stored rather than "Secondary" because that is what the column
 * has always held and what every existing row says; renaming the value would
 * mean a data migration to change a word. The screens say "Secondary", which
 * is what the business calls it.
 *
 * ORDER IS MEANING. The buying run walks this list and takes the first slot
 * that can supply, so moving an entry changes who receives purchase orders.
 * Adding a fourth is a one-line change here and nothing else.
 */
export const RANKS = ["Primary", "Backup", "Third"] as const;

export type Rank = (typeof RANKS)[number];

/** What each slot is called on screen. */
export const RANK_LABELS: Record<Rank, string> = {
  Primary: "Primary",
  Backup: "Secondary",
  Third: "Third",
};

export function isRank(value: string | null): value is Rank {
  return value !== null && (RANKS as readonly string[]).includes(value);
}

/**
 * How a stored rank reads. A null rank is a supplier who carries the item
 * without covering it — an offer — and saying so is the whole point of
 * showing them.
 */
export function rankLabel(value: string | null): string {
  return isRank(value) ? RANK_LABELS[value] : value === null ? "Offer" : value;
}

/**
 * Sort key: cover first in the buying run's order, then offers.
 *
 * Sorting by the rank string alone puts Backup above Primary, which is
 * alphabetical and wrong in the only sense that matters here.
 */
export function rankOrder(value: string | null): number {
  const at = (RANKS as readonly string[]).indexOf(value ?? "");
  return at === -1 ? RANKS.length : at;
}

/**
 * Who takes over when the primary says they are out of stock.
 *
 * Pure, and here rather than in supply-cover.ts, because the rule is worth
 * testing on its own and the service around it needs a database to run.
 *
 * THE FIRST COVERED SUPPLIER, IN ORDER, WHO CAN ACTUALLY SUPPLY. Promoting a
 * backup who is also out of stock would move the slot without moving a single
 * order, and would cost the demoted supplier their standing for nothing.
 *
 * Returns null when there is nobody, and the caller must then leave the ranks
 * alone. Demoting into an empty pack is worse than the situation it is meant
 * to improve: the buying run skips an out-of-stock primary anyway, so the
 * order is already going nowhere, and taking the rank away as well leaves a
 * pack with no cover at all for somebody to notice later.
 */
export function successorTo<T extends { rank: string | null; canSupply: boolean }>(
  losing: Rank,
  supplies: T[]
): T | null {
  const from = RANKS.indexOf(losing);
  if (from === -1) return null;

  for (const rank of RANKS.slice(from + 1)) {
    const found = supplies.find((s) => s.rank === rank && s.canSupply);
    if (found) return found;
  }
  return null;
}
