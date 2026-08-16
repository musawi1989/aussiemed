import "server-only";

import { db } from "./db";
import { audit, type Result } from "./admin";
import { getSessionUser, type SessionUser } from "./auth";

/**
 * What a supplier can see and do — BE-39.
 *
 * Two rules, both load-bearing:
 *
 *  1. A supplier sees purchase orders, never customer orders. Under DEC-24 they
 *     never learn who bought anything, and the cleanest way to guarantee that
 *     is for the portal to have no route to a customer order at all. A purchase
 *     order belongs to exactly one supplier by construction, so scoping stops
 *     being a filter that could be forgotten and becomes the shape of the data.
 *
 *  2. Every query is scoped by the supplier id taken from the session, never
 *     from a parameter. BE-24 records supplier permission bypass as a recurring
 *     bug class; the defence is that no function here accepts a supplier id.
 */

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

export type SupplierSession = SessionUser & { supplierId: string };

/**
 * Throws rather than returning a Result: someone reaching these without a
 * supplier account is not a validation problem they can correct, and a caller
 * must not be able to carry on by ignoring a return value.
 */
export async function requireSupplier(): Promise<SupplierSession> {
  const user = await getSessionUser();
  if (!user || user.role !== "Supplier" || !user.supplierId) {
    throw new Error("Supplier access required");
  }
  return user as SupplierSession;
}

/** Their own purchase orders. Drafts are excluded — those are ours until sent. */
export async function listPurchaseOrders() {
  const { supplierId } = await requireSupplier();

  return db.purchaseOrder.findMany({
    where: { supplierId, status: { not: "Draft" } },
    orderBy: [{ sentAt: "desc" }],
    take: 100,
    include: { lines: { select: { qtyOrdered: true, qtyReceived: true } } },
  });
}

export async function getPurchaseOrder(poNumber: string) {
  const { supplierId } = await requireSupplier();

  // The supplier id is part of the lookup, not a check afterwards, so another
  // supplier's number simply does not resolve.
  return db.purchaseOrder.findFirst({
    where: { poNumber, supplierId, status: { not: "Draft" } },
    include: { lines: { orderBy: { skuCodeSnapshot: "asc" } } },
  });
}

async function loadOwn(id: string, supplierId: string) {
  return db.purchaseOrder.findFirst({ where: { id, supplierId } });
}

/**
 * Acknowledge, once.
 *
 * A second click must not move the timestamp. How quickly a supplier responded
 * is a fact about them that later feeds their lead-time figures, and a stamp
 * that quietly resets every time someone opens the page would flatter whoever
 * clicks the most.
 */
export async function acknowledgePurchaseOrder(id: string): Promise<Result> {
  const actor = await requireSupplier();
  const po = await loadOwn(id, actor.supplierId);

  if (!po) return fail("That purchase order is not one of yours.");
  if (po.status === "Draft") return fail("That purchase order has not been sent.");
  if (po.acknowledgedAt) return ok(undefined);

  await db.purchaseOrder.update({
    where: { id },
    data: { status: "Acknowledged", acknowledgedAt: new Date() },
  });

  await audit(actor, "purchaseOrder.acknowledge", "PurchaseOrder", po.poNumber, {
    status: po.status,
  }, { status: "Acknowledged" });

  return ok(undefined);
}

export type DispatchInput = {
  courier: string | null;
  trackingNumber: string | null;
};

export async function markDispatched(
  id: string,
  input: DispatchInput
): Promise<Result> {
  const actor = await requireSupplier();
  const po = await loadOwn(id, actor.supplierId);

  if (!po) return fail("That purchase order is not one of yours.");
  if (po.status === "Draft") return fail("That purchase order has not been sent.");
  if (po.receivedAt) return fail("It has already been received, so it cannot be re-dispatched.");

  const trim = (v: string | null) => {
    const s = (v ?? "").trim();
    return s.length > 0 ? s : null;
  };

  await db.purchaseOrder.update({
    where: { id },
    data: {
      status: "Dispatched",
      // Set once, like the acknowledgement: the first despatch is the one the
      // delivery time is measured from.
      dispatchedAt: po.dispatchedAt ?? new Date(),
      // Acknowledging is implied by despatching, for a supplier who skips it.
      acknowledgedAt: po.acknowledgedAt ?? new Date(),
      courier: trim(input.courier),
      trackingNumber: trim(input.trackingNumber),
    },
  });

  await audit(actor, "purchaseOrder.dispatch", "PurchaseOrder", po.poNumber, {
    status: po.status,
  }, { status: "Dispatched", courier: trim(input.courier) });

  return ok(undefined);
}
