/**
 * Bulk buy requests — one concept, one name, two states.
 *
 * WHAT THIS REPLACED. There were two things doing the same job: a bulk-buy
 * enquiry (free text, typed into a form) and a quote request (real pack codes,
 * built from the catalogue). Two admin queues, two sets of wording, two places
 * to look, and a customer choosing between them with no way to know that one
 * carried SKUs and the other carried prose. They are now one thing. The
 * mechanism that survived is the quote request, because a request naming
 * ALCOHOLP-LGE can be priced and a request saying "the blue nitrile ones"
 * cannot; the name that survived is "bulk buy request", because that is what
 * the client and the buyer both call it.
 *
 * TWO STATES, NOT FOUR. The old axis was New | Quoted | Answered | Closed,
 * which described what WE had done to a record. Nobody could say a request was
 * finished: a quote sent and then accepted, declined, or simply forgotten all
 * read as "Quoted" for ever, and the queue only ever grew.
 *
 * Pending and Completed answer the question both sides are actually asking —
 * is this still open? Which means ANSWERING DOES NOT COMPLETE IT. A price has
 * gone back and the request is still live until somebody says otherwise; that
 * is a judgement about a conversation, and the person who had the conversation
 * is the one who makes it.
 *
 * Pure, so the rules can be tested without a database, and importable from
 * client components — the buyer's panel and the admin console both render
 * these labels.
 */

export const BULK_BUY_STATUSES = ["Pending", "Completed"] as const;

export type BulkBuyStatus = (typeof BULK_BUY_STATUSES)[number];

export function isBulkBuyStatus(value: unknown): value is BulkBuyStatus {
  return (
    typeof value === "string" &&
    (BULK_BUY_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Anything that is not Completed is open.
 *
 * Reading it this way rather than `=== "Pending"` means a row still carrying an
 * old value — "New", "Quoted", or something a future migration adds — shows up
 * as needing attention instead of vanishing from the queue. A request nobody
 * can see is a customer nobody answers, and that failure is silent; a request
 * shown as open when it is finished costs one glance.
 */
export function isOpen(status: string | null | undefined): boolean {
  return status !== "Completed";
}

/** The state a row should be treated as, whatever is actually stored. */
export function normaliseStatus(status: string | null | undefined): BulkBuyStatus {
  return status === "Completed" ? "Completed" : "Pending";
}

export function statusLabel(status: string | null | undefined): string {
  return normaliseStatus(status);
}

export type BulkBuyRequestSummary = {
  status: string | null;
  /** Set once we have written an answer, whether or not it was emailed. */
  replyToCustomer?: string | null;
};

/**
 * What the buyer's own panel should say about where a request has got to.
 *
 * Three readings, not two, because "Pending" alone does not distinguish "we
 * have not looked at it yet" from "we have priced it and it is with you" — and
 * that is the difference between a buyer waiting on us and a buyer we are
 * waiting on. Told from the buyer's side of the desk, since this is the
 * sentence they read.
 */
export function buyerProgress(request: BulkBuyRequestSummary): {
  headline: string;
  detail: string;
  answered: boolean;
  open: boolean;
} {
  const answered = Boolean(request.replyToCustomer?.trim());

  if (!isOpen(request.status)) {
    return {
      headline: "Completed",
      detail: answered
        ? "We have answered this and closed it off. The reply is below."
        : "This request has been closed off.",
      answered,
      open: false,
    };
  }

  if (answered) {
    return {
      headline: "Answered",
      detail: "Our reply is below. The request stays open until it is settled.",
      answered,
      open: true,
    };
  }

  return {
    headline: "With our team",
    detail: "We have your request and will come back to you with pricing.",
    answered,
    open: true,
  };
}

/**
 * Sorting for a queue: open first, oldest first inside that.
 *
 * The oldest unanswered request is the one costing the most, and burying it
 * under thirty completed ones is how it stays unanswered.
 */
export function queueOrder<T extends { status: string | null; createdAt: Date }>(
  requests: readonly T[]
): T[] {
  return [...requests].sort((a, b) => {
    const openA = isOpen(a.status);
    const openB = isOpen(b.status);
    if (openA !== openB) return openA ? -1 : 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}
