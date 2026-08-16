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

export type AttentionItem = {
  key: string;
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
    newQuotes,
    newEnquiries,
    waitlist,
  ] = await Promise.all([
    db.accountChange.count({ where: { status: "Pending" } }),
    db.purchaseOrder.count({ where: { status: "Draft" } }),
    db.purchaseOrder.count({ where: { status: "Sent" } }),
    db.order.count({ where: { status: "Pending" } }),
    db.quoteRequest.count({ where: { status: "New" } }),
    db.enquiry.count({ where: { status: "New" } }),
    // Restock requests nobody has been told about. The email itself is BE-05
    // and unbuilt, which is exactly why the count needs to be visible.
    db.notifySubscription.count({
      where: { notifiedAt: null, sku: { manualOutOfStock: false } },
    }),
  ]);

  return [
    {
      key: "account-changes",
      label: "Account changes to approve",
      detail:
        "Branches and account names a customer has asked to change. Nothing moves until one of these is decided.",
      count: accountChanges,
      href: "/admin/approvals",
      urgent: true,
    },
    {
      key: "orders",
      label: "Orders not yet started",
      detail: "Placed and still sitting at Order received.",
      count: newOrders,
      href: "/admin/orders?status=Pending",
      urgent: true,
    },
    {
      key: "quotes",
      label: "Quote requests unanswered",
      detail: "A clinic asking for a price. The oldest is costing the most.",
      count: newQuotes,
      href: "/admin/enquiries",
      urgent: true,
    },
    {
      key: "enquiries",
      label: "Bulk-buy enquiries unanswered",
      detail: "The highest-intent visitors on the site.",
      count: newEnquiries,
      href: "/admin/enquiries",
      urgent: true,
    },
    {
      key: "draft-pos",
      label: "Purchase orders in draft",
      detail:
        "Built at the cutoff and not yet sent. Until one goes, nothing is on order for the customers waiting on it.",
      count: draftPurchaseOrders,
      href: "/admin/purchasing",
      urgent: true,
    },
    {
      key: "unacknowledged-pos",
      label: "Purchase orders not acknowledged",
      detail: "Sent to a supplier who has not confirmed they can supply.",
      count: unacknowledged,
      href: "/admin/purchasing",
      urgent: false,
    },
    {
      key: "waitlist",
      label: "Restock requests to tell",
      detail:
        "People waiting on a pack that is back in stock. Nothing is emailed automatically yet (BE-05).",
      count: waitlist,
      href: "/admin/enquiries",
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
