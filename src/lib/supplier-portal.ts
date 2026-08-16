import "server-only";

import { db } from "./db";
import { audit, type Result } from "./admin";
import { recordStatus } from "./status-events";
import { notify } from "./notifications";
import { getSessionUser, type SessionUser } from "./auth";
import {
  checkSupplyTerms,
  parseSupplyRows,
  splitByKnownSkus,
  type RowProblem,
  type SupplyTermsInput,
} from "./supply-terms";

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

  // The supplier is the actor here, not an admin. Recording who caused a
  // transition is what makes "how long does this supplier take" separable
  // from "how long do we take" — BE-30.
  await recordStatus({
    entity: "PurchaseOrder",
    entityId: po.id,
    entityRef: po.poNumber,
    fromStatus: po.status,
    toStatus: "Acknowledged",
    actor: { id: actor.id, name: actor.name, role: "Supplier" },
  });

  await notify({
    kind: "PurchaseOrderAcknowledged",
    subject: `${po.poNumber} acknowledged`,
    body: `${actor.name} confirmed they can supply purchase order ${po.poNumber}.`,
    href: `/admin/purchasing/${po.poNumber}`,
    entity: "PurchaseOrder",
    entityId: po.id,
  });

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

  await recordStatus({
    entity: "PurchaseOrder",
    entityId: po.id,
    entityRef: po.poNumber,
    fromStatus: po.status,
    toStatus: "Dispatched",
    actor: { id: actor.id, name: actor.name, role: "Supplier" },
  });

  return ok(undefined);
}

/* ------------------------------------------------------------------ *
 * The packs they supply — BE-21
 * ------------------------------------------------------------------ */

/**
 * What a supplier sees about the items they supply.
 *
 * Deliberately narrow. They get our item code and the product name, because
 * without those they cannot tell which pack a row is about, and their own
 * terms, because those are theirs to set. They do not get our selling price,
 * our margin, or the other supplier's cost — a supplier who can see the markup
 * on their own goods is a commercial problem, and one who can see their
 * competitor's price is a worse one. The select below is the guarantee: those
 * columns are not filtered out afterwards, they are never read.
 */
export async function listMySupplies() {
  const { supplierId } = await requireSupplier();

  const supplies = await db.productSupply.findMany({
    where: { supplierId },
    orderBy: [{ isAvailable: "asc" }, { sku: { skuCode: "asc" } }],
    select: {
      id: true,
      rank: true,
      costFils: true,
      supplierPartNumber: true,
      leadTimeDays: true,
      isAvailable: true,
      sku: {
        select: {
          skuCode: true,
          unitLabel: true,
          isActive: true,
          product: { select: { name: true, status: true } },
        },
      },
    },
  });

  return supplies.map((supply) => ({
    id: supply.id,
    // Their standing with us on this item. Shown because it changes what a
    // supplier should expect: a backup only receives orders when the primary
    // cannot supply, so a quiet month is not necessarily a lost customer.
    rank: supply.rank,
    skuCode: supply.sku.skuCode,
    productName: supply.sku.product.name,
    unitLabel: supply.sku.unitLabel,
    /** Ours, not theirs: a retired pack explains why nothing is ordered. */
    listed: supply.sku.isActive && supply.sku.product.status === "Active",
    costFils: supply.costFils,
    supplierPartNumber: supply.supplierPartNumber,
    leadTimeDays: supply.leadTimeDays,
    isAvailable: supply.isAvailable,
  }));
}

export type MySupply = Awaited<ReturnType<typeof listMySupplies>>[number];

/**
 * Updates one line's terms.
 *
 * Takes the supply row's id and checks it belongs to the session's supplier as
 * part of the lookup, not afterwards — someone else's id simply does not
 * resolve. Nothing here can create a supply row: which suppliers can supply
 * what is an admin decision, and a portal that could create the pairing would
 * let a supplier appoint themselves to a competitor's line.
 */
export async function updateMySupply(
  supplyId: string,
  input: SupplyTermsInput
): Promise<Result> {
  const actor = await requireSupplier();

  const existing = await db.productSupply.findFirst({
    where: { id: supplyId, supplierId: actor.supplierId },
    select: {
      id: true,
      costFils: true,
      supplierPartNumber: true,
      leadTimeDays: true,
      isAvailable: true,
      sku: { select: { skuCode: true } },
    },
  });
  if (!existing) return fail("That item is not one you supply.");

  const checked = checkSupplyTerms(input);
  if (!checked.ok) return fail(checked.error);

  await db.productSupply.update({
    where: { id: supplyId },
    data: checked.terms,
  });

  await audit(
    actor,
    "supply.update",
    "ProductSupply",
    existing.sku.skuCode,
    {
      costFils: existing.costFils,
      supplierPartNumber: existing.supplierPartNumber,
      leadTimeDays: existing.leadTimeDays,
      isAvailable: existing.isAvailable,
    },
    checked.terms
  );

  return ok(undefined);
}

/**
 * The whole company in or out.
 *
 * Distinct from a single item being unavailable, and much blunter: while this
 * is off, every line where they are primary reverts to the backup. See DEC-25.
 */
export async function setMyAvailability(available: boolean): Promise<Result> {
  const actor = await requireSupplier();

  const before = await db.supplier.findUnique({
    where: { id: actor.supplierId },
    select: { isAvailable: true },
  });

  await db.supplier.update({
    where: { id: actor.supplierId },
    data: { isAvailable: available },
  });

  await audit(
    actor,
    "supplier.availability",
    "Supplier",
    actor.supplierId,
    { isAvailable: before?.isAvailable },
    { isAvailable: available }
  );

  return ok(undefined);
}

export async function myCompany() {
  const { supplierId } = await requireSupplier();

  return db.supplier.findUnique({
    where: { id: supplierId },
    select: {
      companyName: true,
      isAvailable: true,
      promisedLeadTimeDays: true,
      ackSlaHours: true,
      primaryEmail: true,
      secondaryEmail: true,
    },
  });
}

/* ------------------------------------------------------------------ *
 * Bulk update — BE-21
 * ------------------------------------------------------------------ */

export type UploadOutcome = {
  updated: number;
  problems: RowProblem[];
  /** Rows about packs this supplier is not set up for. */
  notSupplied: string[];
};

/**
 * Applies a parsed price list.
 *
 * Rows are matched on our item code against the packs this supplier already
 * supplies. Anything else is reported back rather than created — the pairing
 * is not theirs to make. A blank availability column means no change, so a
 * supplier sending a price update does not silently mark discontinued lines
 * back in stock.
 */
export async function applySupplyUpload(
  cells: (string | number | boolean | null | undefined)[][]
): Promise<Result<UploadOutcome>> {
  const actor = await requireSupplier();

  const parsed = parseSupplyRows(cells);

  const mine = await db.productSupply.findMany({
    where: { supplierId: actor.supplierId },
    select: { id: true, sku: { select: { skuCode: true } } },
  });
  const byCode = new Map(
    mine.map((supply) => [supply.sku.skuCode.toLowerCase(), supply.id])
  );

  const { applicable, notSupplied } = splitByKnownSkus(
    parsed.rows,
    mine.map((supply) => supply.sku.skuCode)
  );

  let updated = 0;
  for (const row of applicable) {
    const id = byCode.get(row.skuCode.toLowerCase());
    if (!id) continue;

    await db.productSupply.update({
      where: { id },
      data: {
        supplierPartNumber: row.supplierPartNumber,
        costFils: row.costFils,
        leadTimeDays: row.leadTimeDays,
        // Blank means no change, so the current value is kept rather than
        // being defaulted to available.
        ...(row.isAvailable === null ? {} : { isAvailable: row.isAvailable }),
      },
    });
    updated++;
  }

  await audit(actor, "supply.bulkUpdate", "Supplier", actor.supplierId, null, {
    updated,
    rejected: parsed.problems.length,
    notSupplied: notSupplied.length,
  });

  return ok({
    updated,
    problems: parsed.problems,
    notSupplied: notSupplied.map((row) => row.skuCode),
  });
}
