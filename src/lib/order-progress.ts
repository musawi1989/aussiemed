/**
 * What an order's status means to the person who placed it.
 *
 * The database stores an operator's words — Pending, Processing, Dispatched —
 * which are the right words for the warehouse and the wrong ones for a clinic
 * manager asking where their gloves are. "Pending" in particular reads as
 * "nothing has happened and might not", when it means the order is in and
 * waiting for the day's buying run.
 *
 * No database access here, so the account list, the order page and anything
 * later that needs to say where an order is all read the same definitions
 * rather than three drifting copies of them.
 */

export type ProgressState = "done" | "current" | "todo";

export type ProgressStep = {
  key: string;
  /** What the customer is told this stage is. */
  label: string;
  state: ProgressState;
};

export type OrderProgress = {
  steps: ProgressStep[];
  /** Cancelled is not a stage on the way to anywhere — it leaves the track. */
  cancelled: boolean;
  /** Delivered or cancelled: nothing further is going to happen. */
  closed: boolean;
  /** The stage in one phrase, for a badge or a heading. */
  headline: string;
  /** What happens next, in a sentence, so nobody has to ring to find out. */
  detail: string;
};

/** The journey a customer is actually following, in order. */
const TRACK = [
  {
    key: "Pending",
    label: "Order received",
    detail:
      "We have your order. It joins today's buying run, which closes at 5pm.",
  },
  {
    key: "Processing",
    label: "Being prepared",
    detail:
      "Your items are being brought in and packed for you at our sorting facility.",
  },
  {
    key: "Dispatched",
    label: "On the way",
    detail: "Your order has left us and is with the courier.",
  },
  {
    key: "Delivered",
    label: "Delivered",
    detail: "This order arrived. You can repeat it in two clicks.",
  },
] as const;

const CANCELLED = {
  headline: "Cancelled",
  detail: "This order was cancelled and nothing will be delivered against it.",
};

/**
 * An unrecognised status is treated as the first stage rather than crashing or
 * showing a blank track. A status this module has not been taught about still
 * means an order exists and is being worked on, and the customer is better
 * served by the honest floor than by an empty panel.
 */
export function orderProgress(status: string): OrderProgress {
  if (status === "Cancelled") {
    return {
      steps: TRACK.map((step) => ({
        key: step.key,
        label: step.label,
        state: "todo" as const,
      })),
      cancelled: true,
      closed: true,
      ...CANCELLED,
    };
  }

  const index = Math.max(
    0,
    TRACK.findIndex((step) => step.key === status)
  );
  const here = TRACK[index];

  return {
    steps: TRACK.map((step, i) => ({
      key: step.key,
      label: step.label,
      state: i < index ? "done" : i === index ? "current" : "todo",
    })),
    cancelled: false,
    closed: status === "Delivered",
    headline: here.label,
    detail: here.detail,
  };
}

/** Still going: worth showing at the top of a list with its progress. */
export function isOpenOrder(status: string): boolean {
  return status !== "Delivered" && status !== "Cancelled";
}

/**
 * Whether the order-level status is hiding a split delivery.
 *
 * An order is rarely one thing. Half the lines can ship while one waits on a
 * supplier, and the order-level status has to pick a single word for that —
 * so a customer reading "On the way" needs telling that one line is not.
 * Returns null when nothing is being waited on, because a note that says
 * nothing is noise on every order that has none.
 *
 * It reports only the lines actually being waited on. An earlier version said
 * "1 of 7 lines have shipped; 1 is still coming", which reads as a partition
 * of the order and left five lines — picked, packed, in transit to us —
 * unaccounted for. A customer counting the boxes against that sentence would
 * think four had gone missing. Lines already shipped get one clause with no
 * number in it, which is the only claim that stays true whatever the other
 * lines are doing.
 */
export function splitDeliveryNote(lineStatuses: string[]): string | null {
  // A cancelled line is not late. It is gone, and it is not part of the count
  // a customer should be watching for.
  const live = lineStatuses.filter((s) => s !== "Cancelled");
  if (live.length < 2) return null;

  const waiting = live.filter(
    (s) => s === "Backordered" || s === "Pending"
  ).length;
  if (waiting === 0 || waiting === live.length) return null;

  const shipped = live.some((s) => s === "Shipped");

  return (
    `${waiting} of ${live.length} lines ${waiting === 1 ? "is" : "are"} ` +
    `still being sourced.` +
    (shipped ? " Part of this order has already shipped." : "")
  );
}
