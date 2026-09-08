import "server-only";

import { db } from "./db";
import { audit, requireAdmin } from "./admin";
import { isBulkBuyStatus, queueOrder } from "./bulk-buy-requests";

/**
 * Bulk buy requests, from the back office.
 *
 * The storefront writes these in enquiries.ts (createQuoteRequest, which keeps
 * its name because that is the table). This is the other half: reading the
 * queue and saying whether a request is finished.
 *
 * Replying lives in the section's own actions file, because it sends an email
 * and everything that reaches a customer is kept where it can be seen.
 */

export type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

/**
 * The whole queue, open first and oldest first inside that.
 *
 * Ordered in JavaScript rather than SQL because "open" is not a column: it is
 * "anything that is not Completed", which is how a row carrying a status left
 * over from the old four-value axis still reaches somebody. See
 * bulk-buy-requests.ts, where that rule is stated once and tested.
 */
export async function listBulkBuyRequests(limit?: number) {
  await requireAdmin("bulkBuy", "view");

  const rows = await db.quoteRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { name: true, email: true } },
      organisation: { select: { id: true, name: true } },
      items: {
        include: {
          sku: {
            select: {
              skuCode: true,
              unitLabel: true,
              priceFils: true,
              product: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  return queueOrder(rows);
}

/** How many are still open, for the badge on the nav. */
export async function openBulkBuyCount(): Promise<number> {
  return db.quoteRequest.count({ where: { status: { not: "Completed" } } });
}

/**
 * Marks a request finished, or puts it back.
 *
 * BOTH DIRECTIONS, deliberately. Completed is a judgement somebody makes about
 * a conversation, and judgements are made wrongly; a one-way switch would mean
 * the only way to correct a mis-click is a database edit.
 *
 * The name is snapshotted rather than linked, like every other name on a
 * record here: an admin who leaves must not blank the history of what they
 * decided.
 */
export async function setBulkBuyStatus(
  id: string,
  status: string
): Promise<Result<{ status: string }>> {
  const actor = await requireAdmin("bulkBuy");

  if (!isBulkBuyStatus(status)) {
    return fail("That is not a status we recognise.");
  }

  const request = await db.quoteRequest.findUnique({
    where: { id },
    select: { id: true, reference: true, status: true },
  });
  if (!request) return fail("That request no longer exists.");

  if (request.status === status) {
    return fail(`That request is already ${status.toLowerCase()}.`);
  }

  await db.quoteRequest.update({
    where: { id },
    data: {
      status,
      // Cleared on reopening, so a request put back into the queue does not
      // carry a completion stamp that is no longer true.
      completedAt: status === "Completed" ? new Date() : null,
      completedByName: status === "Completed" ? actor.name : null,
    },
  });

  await audit(
    actor,
    status === "Completed" ? "bulkBuy.complete" : "bulkBuy.reopen",
    "QuoteRequest",
    request.reference,
    { status: request.status },
    { status }
  );

  return ok({ status });
}
