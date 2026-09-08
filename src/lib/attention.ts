import "server-only";

import { db } from "./db";
import { getSessionUser } from "./auth";

/**
 * Everything sitting in a queue waiting for a person.
 *
 * The back office had grown a queue per screen — purchase orders on one,
 * enquiries on another, and now account changes on a third — with no way to
 * find out whether any of them had anything in it without opening all of
 * them. This is the one place that answers "what needs me today".
 *
 * It is deliberately counts and links rather than a fourth list of the same
 * rows. Each queue already has a screen that knows how to work it; what was
 * missing was knowing to go there.
 */

/**
 * The three kinds of waiting, which are three different jobs.
 *
 * The page was one flat grid of nine cards, so "a supplier wants more money"
 * sat beside "an email did not send" with nothing to say they are answered
 * differently. Grouping them is the difference between a list you read and a
 * list you work.
 *
 *   decide  — somebody outside is waiting on a yes or a no from us
 *   sell    — an order we can turn into a conversation, or lose by ignoring
 *   do      — work of ours that nobody is blocked on, but that has to happen
 */
export type AttentionGroup = "decide" | "sell" | "do";

export const GROUP_LABELS: Record<AttentionGroup, string> = {
  decide: "Waiting on a decision",
  sell: "Orders that need a call",
  do: "Work to get through",
};

export const GROUP_BLURBS: Record<AttentionGroup, string> = {
  decide:
    "Somebody outside AussieMed cannot move until one of these is answered.",
  sell: "A customer has ordered something we cannot fill. They were not told.",
  do: "Ours to do. Nobody is blocked, but none of it does itself.",
};

export type AttentionItem = {
  key: string;
  group: AttentionGroup;
  label: string;
  /** What the number means, so a zero and a nine both read correctly. */
  detail: string;
  count: number;
  href: string;
  /** Something a customer or supplier is actively waiting on. */
  urgent: boolean;
};

export async function attentionItems(): Promise<AttentionItem[]> {
  const user = await getSessionUser();
  if (!user || user.role !== "Admin") return [];

  const [
    accountChanges,
    draftPurchaseOrders,
    unacknowledged,
    newOrders,
    openBulkBuy,
    waitlist,
    stuckEmail,
    priceRequests,
    supplierOffers,
    productsToApprove,
    tradeApplications,
    ordersOutOfStock,
    packsWithoutPrimary,
  ] = await Promise.all([
    db.accountChange.count({ where: { status: "Pending" } }),
    db.purchaseOrder.count({ where: { status: "Draft" } }),
    db.purchaseOrder.count({ where: { status: "Sent" } }),
    db.order.count({ where: { status: "Pending" } }),
    /*
     * Open bulk buy requests — anything that is NOT Completed.
     *
     * Counted this way rather than `status: "Pending"` so a row still carrying
     * a value from the old four-state axis surfaces instead of vanishing. See
     * isOpen in bulk-buy-requests.ts, where the rule is stated once and
     * tested: a request nobody can see is a customer nobody answers, and that
     * failure is silent.
     */
    db.quoteRequest.count({ where: { status: { not: "Completed" } } }),
    // Restock requests nobody has been told about. These now send on the
    // moment a pack comes back in stock, so anything sitting here is a pack
    // that never flipped rather than a message that was never written.
    db.notifySubscription.count({
      where: { notifiedAt: null, sku: { manualOutOfStock: false } },
    }),
    // Email that did not go. Worth its own line: the whole reason BE-05
    // records every attempt is that a send which silently fails looks
    // exactly like one that worked.
    db.outboundEmail.count({ where: { status: { in: ["Failed", "Queued"] } } }),
    // Prices suppliers have asked to be paid. Held rather than applied, so one
    // sitting here is a supplier waiting on an answer — not a wrong figure
    // loose in the buying run.
    db.productSupply.count({ where: { proposedCostFils: { not: null } } }),
    // A supplier has put an item on their own list and nobody has accepted it.
    // Only counted while approvals are switched on; otherwise the flag is
    // false on rows that were never meant to be reviewed.
    db.productSupply.count({ where: { isApproved: false } }),
    db.productMaster.count({ where: { status: "PendingApproval" } }),
    db.user.count({
      where: { role: "Customer", approvalStatus: "Pending", isDisabled: false },
    }),
    /*
     * Orders carrying a line we hold none of.
     *
     * The storefront tells a buyer nothing about stock, so they can order what
     * we have not got — deliberately, because that is a chance to sell them an
     * alternative. This is the only place that chance is visible in aggregate;
     * without it somebody has to open orders one at a time to find them.
     *
     * Closed orders are excluded: a delivered or cancelled order is not a call
     * anybody still needs to make.
     */
    db.order.count({
      where: {
        status: { notIn: ["Delivered", "Cancelled"] },
        items: { some: { sku: { manualOutOfStock: true } } },
      },
    }),
    /*
     * On sale, covered by somebody, and nobody in the primary slot.
     *
     * NOT the same as the unallocated list, which finds packs with no cover at
     * all. These have a supplier and will be bought from — just from whoever
     * happens to be second, because the first slot is empty. The buying run
     * copes with it; nobody decided it, and the Cost and margin screen reads
     * "against the secondary" with no primary to compare against.
     */
    db.productSku.count({
      where: {
        isActive: true,
        product: { is: { status: "Active" } },
        supplies: { some: { rank: { not: null } } },
        NOT: { supplies: { some: { rank: "Primary" } } },
      },
    }),
  ]);

  return [
    /* ---- waiting on a decision from us ---- */
    {
      key: "trade-applications",
      group: "decide" as const,
      label: "Trade accounts to approve",
      detail:
        "A business that has applied and cannot order anything until somebody says yes.",
      count: tradeApplications,
      href: "/admin/applications",
      urgent: true,
    },
    {
      key: "price-requests",
      group: "decide" as const,
      label: "Supplier price changes to approve",
      detail:
        "What a supplier has asked to be paid. Until one is decided we go on paying the agreed price.",
      count: priceRequests,
      href: "/admin/suppliers/prices",
      urgent: true,
    },
    {
      key: "account-changes",
      group: "decide" as const,
      label: "Account changes to approve",
      detail:
        "Branches and account names a customer has asked to change. Nothing moves until one of these is decided.",
      count: accountChanges,
      href: "/admin/approvals",
      urgent: true,
    },
    {
      key: "supplier-offers",
      group: "decide" as const,
      label: "Supplier offers to accept",
      detail:
        "A supplier has added an item to their own list. Until it is accepted they cannot be given cover on it.",
      count: supplierOffers,
      href: "/admin/suppliers/cover",
      urgent: false,
    },
    {
      key: "products-pending",
      group: "decide" as const,
      label: "Products waiting for approval",
      detail: "Drafted and submitted, but not yet live on the storefront.",
      count: productsToApprove,
      href: "/admin/products?status=PendingApproval",
      urgent: false,
    },

    /* ---- a sale to save ---- */
    {
      key: "orders-out-of-stock",
      group: "sell" as const,
      label: "Orders we cannot fill",
      detail:
        "An open order contains something we hold none of. The buyer was never told, so this is a call to offer an alternative — not a problem to hide.",
      count: ordersOutOfStock,
      href: "/admin/orders?issue=stock",
      urgent: true,
    },

    /* ---- ours to do ---- */
    {
      key: "orders",
      group: "do" as const,
      label: "Orders not yet started",
      detail: "Placed and still sitting at Order received.",
      count: newOrders,
      href: "/admin/orders?status=Pending",
      urgent: true,
    },
    {
      // One card, because there is now one queue. It was two — quote requests
      // and bulk-buy enquiries — describing the same conversation.
      key: "bulk-buy",
      group: "do" as const,
      label: "Bulk buy requests open",
      detail:
        "A clinic asking for a price on named packs. The oldest is costing the most.",
      count: openBulkBuy,
      href: "/admin/bulk-buy",
      urgent: true,
    },
    {
      key: "no-primary",
      group: "do" as const,
      label: "Packs with no primary supplier",
      detail:
        "Somebody covers them, but the first slot is empty — so they are bought from whoever happens to be second, and nobody chose that.",
      count: packsWithoutPrimary,
      href: "/admin/suppliers/cover?missing=primary",
      urgent: false,
    },
    {
      key: "draft-pos",
      group: "do" as const,
      label: "Purchase orders in draft",
      detail:
        "Built and not yet sent. Until one goes, nothing is on order for the customers waiting on it.",
      count: draftPurchaseOrders,
      href: "/admin/purchasing",
      urgent: true,
    },
    {
      key: "unacknowledged-pos",
      group: "do" as const,
      label: "Purchase orders not acknowledged",
      detail: "Sent to a supplier who has not confirmed they can supply.",
      count: unacknowledged,
      href: "/admin/purchasing",
      urgent: false,
    },
    {
      key: "email",
      group: "do" as const,
      label: "Email that did not go",
      detail:
        "Failed or still queued. A customer or supplier is missing something they were meant to be told.",
      count: stuckEmail,
      href: "/admin/emails?status=Failed",
      urgent: true,
    },
    {
      key: "waitlist",
      group: "do" as const,
      label: "Restock requests to tell",
      detail:
        "People waiting on a pack that is back in stock. The storefront no longer offers this, so nothing new arrives here.",
      count: waitlist,
      href: "/admin/approvals#waiting-on-stock",
      urgent: false,
    },
  ];
}

/** The total for the sidebar badge — urgent queues only. */
export async function attentionCount(): Promise<number> {
  const items = await attentionItems();
  return items
    .filter((item) => item.urgent)
    .reduce((total, item) => total + item.count, 0);
}
