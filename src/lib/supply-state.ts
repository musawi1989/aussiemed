/**
 * Why a supplier cannot send us something.
 *
 * "Unavailable" was a checkbox, which answered whether but never why — and the
 * two reasons want completely different things from us. Out of stock is a
 * waiting problem: buy the backup this week and ask again next month.
 * Discontinued is a catalogue problem: the line is gone, and somebody has to
 * find a replacement or stop selling it. Treating them the same is how a
 * product stays on the shelf for a year being quietly bought from the backup
 * at a worse price.
 *
 * Pure. No imports at runtime.
 */

export const SUPPLY_STATES = [
  "Available",
  "OutOfStock",
  "Discontinued",
] as const;

export type SupplyState = (typeof SUPPLY_STATES)[number];

export type SupplyStateMeta = {
  /** What a supplier sees in the dropdown. */
  label: string;
  /** What it means, in the words we would use to them. */
  meaning: string;
  /** Whether the buying run may still order this line from them. */
  canSupply: boolean;
  /** Whether offering a replacement makes sense. */
  invitesAlternative: boolean;
  /** Matches the tones in status-tone.ts, so the pill reads like every other. */
  tone: "complete" | "attention" | "stopped";
};

export const SUPPLY_STATE_META: Record<SupplyState, SupplyStateMeta> = {
  Available: {
    label: "Can supply",
    meaning: "Send us this whenever we order it.",
    canSupply: true,
    invitesAlternative: false,
    tone: "complete",
  },
  OutOfStock: {
    label: "Out of stock",
    meaning:
      "Temporarily unable to supply. We will use the backup and come back to you.",
    canSupply: false,
    // Worth asking: a supplier who is out of a 100-box often has the 50-box,
    // and knowing that is the difference between a substitution and a delay.
    invitesAlternative: true,
    tone: "attention",
  },
  Discontinued: {
    label: "Discontinued",
    meaning:
      "This line has ended and is not coming back. We will need a replacement.",
    canSupply: false,
    invitesAlternative: true,
    tone: "stopped",
  },
};

export function isSupplyState(value: string): value is SupplyState {
  return (SUPPLY_STATES as readonly string[]).includes(value);
}

export function supplyStateMeta(value: string): SupplyStateMeta {
  return isSupplyState(value)
    ? SUPPLY_STATE_META[value]
    : SUPPLY_STATE_META.Available;
}

/**
 * The single fact the buying run reads, derived from the state.
 *
 * `isAvailable` is a separate column because ten places already read it and
 * the daily purchase run is one of them. It must never be set on its own —
 * this function is what keeps the two in step, and db:check asserts they agree
 * so a write that forgets is caught rather than quietly moving orders to a
 * backup nobody chose.
 */
export function availabilityFor(state: string): boolean {
  return supplyStateMeta(state).canSupply;
}

/**
 * Whether an alternative should be kept.
 *
 * Cleared when a supplier says they can supply again: a replacement offered
 * while a line was out of stock is advice about that moment, and left in place
 * it becomes a suggestion to buy the wrong thing.
 */
export function keepsAlternative(state: string): boolean {
  return supplyStateMeta(state).invitesAlternative;
}

/** A sentence for the admin, naming the supplier and what they said. */
export function supplyNotice(input: {
  state: string;
  supplierName: string;
  alternativeName?: string | null;
}): string | null {
  const meta = supplyStateMeta(input.state);
  if (meta.canSupply) return null;

  const what =
    input.state === "Discontinued"
      ? `${input.supplierName} has discontinued this line`
      : `${input.supplierName} is out of stock`;

  return input.alternativeName
    ? `${what}, and suggests ${input.alternativeName} instead.`
    : `${what}.`;
}
