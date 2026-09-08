import { includedInPackingList } from "./consignment-maths.ts";

/**
 * What a purchase order still owes us, and what a proposed docket would do.
 *
 * The supplier-side twin of shipment-maths.ts, and pure for the same reason:
 * this is the arithmetic that must be right, and anything reaching the database
 * can only be tested by building a purchase order first. A line docketed twice,
 * a docket for more than is owed, a supplier who sends more than they promised
 * — all of it is written down as tests here instead of being discovered when a
 * pallet arrives.
 *
 * ONE RULE UNDERNEATH ALL OF IT: a line's outstanding quantity is qtyOrdered
 * minus the sum of every docket line against it. Never a status flag, and never
 * qtyConfirmed. Those are three different facts:
 *
 *   qtyOrdered   what we asked for
 *   qtyConfirmed what they promised — a claim, which may be revised
 *   docketed     what has actually left them, which is the only one that
 *                reduces what is still owed
 *
 * A supplier who promised four and found six can send six; a supplier who
 * promised four and sends none still owes four. Neither of those works if the
 * promise is what the arithmetic runs on.
 */

export type DocketableLine = {
  id: string;
  name: string;
  skuCode: string;
  qtyOrdered: number;
  /** What they said they could send. Advisory here — see the note above. */
  qtyConfirmed: number | null;
  /** Total already sent across every earlier docket on this order. */
  docketed: number;
};

export type DocketPlanLine = DocketableLine & {
  /** Ordered minus docketed, floored at zero. */
  outstanding: number;
  /** True when this line has nothing left to come. */
  settled: boolean;
  /**
   * What the next docket should open at.
   *
   * The outstanding quantity, which is what the client chose: a supplier
   * filling the rest of an order should not have to retype what is owed. It is
   * only a starting number — the form is editable, and checkDocket judges what
   * they actually typed.
   */
  suggested: number;
};

export function planLines(lines: DocketableLine[]): DocketPlanLine[] {
  return lines.map((line) => {
    const outstanding = Math.max(0, line.qtyOrdered - line.docketed);
    return {
      ...line,
      outstanding,
      settled: outstanding === 0,
      suggested: outstanding,
    };
  });
}

/** Nothing left to come on any line. */
export function isFullyDocketed(lines: DocketableLine[]): boolean {
  return planLines(lines).every((line) => line.settled);
}

/**
 * Whether anything has been sent at all.
 *
 * Distinguishes "not dispatched yet" from "part-dispatched", which is the
 * difference between PartiallyDispatched and Sent on the order.
 */
export function hasDocketed(lines: DocketableLine[]): boolean {
  return lines.some((line) => line.docketed > 0);
}

export type ProposedDocketLine = { purchaseOrderLineId: string; qty: number };

export type DocketCheck =
  | { ok: true; lines: ProposedDocketLine[] }
  | { ok: false; error: string };

/**
 * Validates a docket before anything is written.
 *
 * Refuses rather than clamps, exactly as checkShipment does. Quietly reducing
 * 80 to the 60 still owed would print a docket that disagrees with what the
 * supplier typed, and the disagreement would surface at our goods-in bench with
 * the goods already in the building.
 */
export function checkDocket(
  lines: DocketableLine[],
  proposed: ProposedDocketLine[]
): DocketCheck {
  if (proposed.some(line => !Number.isSafeInteger(line.qty) || line.qty < 0)) return { ok: false, error: "Docket quantities must be whole numbers of zero or more." };
  const plan = new Map(planLines(lines).map((line) => [line.id, line]));

  // Zero and blank are how a packer says "not this one" — dropped, not
  // refused, or a twenty-line order sending two would be eighteen errors.
  const wanted = proposed.filter((line) => line.qty > 0);

  if (wanted.length === 0) {
    return {
      ok: false,
      error:
        "Nothing is on this docket yet — enter a quantity against at least one line.",
    };
  }

  const seen = new Set<string>();
  for (const line of wanted) {
    const target = plan.get(line.purchaseOrderLineId);
    if (!target) {
      return {
        ok: false,
        error: "That line is not on this purchase order any more. Reload and try again.",
      };
    }
    if (seen.has(line.purchaseOrderLineId)) {
      return { ok: false, error: `${target.name} appears twice on this docket.` };
    }
    seen.add(line.purchaseOrderLineId);

    if (!Number.isInteger(line.qty) || line.qty < 0) {
      return {
        ok: false,
        error: `${target.name}: a docket has to be a whole number of units.`,
      };
    }
    if (line.qty > target.outstanding) {
      return {
        ok: false,
        error:
          target.outstanding === 0
            ? `${target.name} has already been sent in full.`
            : `${target.name}: only ${target.outstanding} of ${target.qtyOrdered} ${
                target.outstanding === 1 ? "is" : "are"
              } still outstanding, so ${line.qty} cannot go.`,
      };
    }
  }

  return { ok: true, lines: wanted };
}

/**
 * What the purchase order's status becomes once a docket is recorded.
 *
 * A part-dispatched order does NOT become Dispatched. That is the case this
 * whole feature exists for, and calling it dispatched is how the remainder gets
 * forgotten: the order reads as complete, drops off the queue, and the units
 * still to come are remembered only by whoever is waiting for them.
 *
 * The receiving statuses win. Goods-in is downstream of despatch, so an order
 * already being received must not be dragged backwards by a late docket for
 * the rest of it — the same rule that stopped a despatch pulling a delivered
 * order back to Dispatched (BE-77).
 */
export function statusAfterDocket(
  currentStatus: string,
  lines: DocketableLine[]
): string {
  if (
    currentStatus === "PartiallyReceived" ||
    currentStatus === "Received" ||
    currentStatus === "Cancelled"
  ) {
    return currentStatus;
  }
  if (!hasDocketed(lines)) return ["Dispatched", "PartiallyDispatched"].includes(currentStatus) ? "Acknowledged" : currentStatus;
  return isFullyDocketed(lines) ? "Dispatched" : "PartiallyDispatched";
}

/**
 * What is still to follow after a given docket.
 *
 * Printed on the docket itself, so the person unpacking the box can see what
 * is not in it. Counts only dockets up to and including this one: reprinting
 * docket 1 after docket 2 has gone must still show what docket 1 left behind,
 * or the document changes meaning after the fact.
 */
export function toFollowAfter(
  lines: (DocketableLine & { dockets: { sequence: number; qty: number; dispatchedAt?: Date | null }[] })[],
  sequence: number,
  asOf?: Date,
): { name: string; skuCode: string; qty: number }[] {
  return lines
    .map((line) => {
      const sent = line.dockets
        .filter((d) => asOf ? includedInPackingList(d, sequence, asOf) : d.sequence <= sequence)
        .reduce((n, d) => n + d.qty, 0);
      return {
        name: line.name,
        skuCode: line.skuCode,
        qty: Math.max(0, line.qtyOrdered - sent),
      };
    })
    .filter((line) => line.qty > 0);
}
