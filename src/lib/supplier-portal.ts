import "server-only";
import {
  availabilityFor,
  isSupplyState,
  keepsAlternative,
} from "./supply-state";

import { db } from "./db";
import { audit, type Result } from "./admin";
import { recordStatus } from "./status-events";
import { getSessionUser, type SessionUser } from "./auth";
import {
  checkSupplyTerms,
  parseSupplyRows,
  priceIntent,
  splitByKnownSkus,
  NO_PRICE_REQUEST,
  type RowProblem,
  type SupplyTermsInput,
} from "./supply-terms";
import { ensure, supplierPermissions } from "./permissions";
import { createDocket, docketPlan } from "./dockets";
import type { ProposedDocketLine } from "./docket-maths";
import { demoteOutOfStockPrimary } from "./supply-cover";
import { writableSupplyFields } from "./permission-catalogue";

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

/** What a supplier can filter by. Draft is ours and never reaches them. */
export const SUPPLIER_PO_STATUSES = [
  "Sent",
  "Acknowledged",
  "PartiallyDispatched",
  "Dispatched",
  "PartiallyReceived",
  "Received",
  "Cancelled",
] as const;

export type PurchaseOrderFilters = {
  /** Their PO number, or a tracking number off a consignment. */
  q?: string;
  /** One of PURCHASE_ORDER_STATUSES. Anything else is ignored. */
  status?: string;
  /** ISO dates, inclusive. Either end may be given on its own. */
  from?: string;
  to?: string;
};

/**
 * Their own purchase orders. Drafts are excluded — those are ours until sent.
 *
 * FILTERED HERE RATHER THAN IN THE PAGE. This screen was the whole list, 100
 * at a time, with no way through it: fine for a supplier with three orders and
 * unusable for one with a year of them, who wants "the one from March" and has
 * to scroll for it. The supplier id still comes from the session and is part
 * of the query, never a parameter — the filters narrow their own orders and
 * cannot widen the set beyond them.
 */
export async function listPurchaseOrders(filters: PurchaseOrderFilters = {}) {
  const { supplierId } = await requireSupplier();

  const q = (filters.q ?? "").trim();
  const from = filters.from ? new Date(filters.from) : null;
  const to = filters.to ? new Date(filters.to) : null;

  // The end of the chosen day, not its first instant — otherwise "to: today"
  // excludes everything ordered today, which reads as data loss.
  if (to) to.setHours(23, 59, 59, 999);

  const valid = (d: Date | null) => (d && !Number.isNaN(d.getTime()) ? d : null);

  return db.purchaseOrder.findMany({
    where: {
      supplierId,
      status: { not: "Draft" },
      ...(filters.status && filters.status !== "all"
        ? { status: filters.status }
        : {}),
      ...(q
        ? { OR: [{ poNumber: { contains: q } }, { trackingNumber: { contains: q } }] }
        : {}),
      ...(valid(from) || valid(to)
        ? {
            createdAt: {
              ...(valid(from) ? { gte: valid(from)! } : {}),
              ...(valid(to) ? { lte: valid(to)! } : {}),
            },
          }
        : {}),
    },
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
    include: {
      lines: { orderBy: { skuCodeSnapshot: "asc" }, include: { docketLines: { select: { qty: true, docket: { select: { dispatchedAt: true } } } } } },
      payments: { orderBy: [{ occurredAt: "asc" }, { recordedAt: "asc" }], select: { id: true, occurredAt: true, kind: true, amountFils: true } },
      // Their own trading name, for the paperwork they print from here. Safe
      // by construction: the lookup is already scoped to this supplier, so
      // this can only ever be the name of the company asking.
      supplier: { select: { companyName: true } },
    },
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

  const allowed = await ensure("acknowledgeOrders");
  if (!allowed.ok) return allowed;

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


  return ok(undefined);
}

export type DispatchInput = {
  courier: string | null;
  trackingNumber: string | null;
  note?: string | null;
  /**
   * What is physically in this consignment, line by line.
   *
   * Absent means "everything still outstanding", which is what the one-click
   * despatch of a complete order means and what the old whole-order button
   * did. Present means the supplier has said which of it is going.
   */
  lines?: ProposedDocketLine[];
};

/**
 * What this order still owes us, and every docket already raised on it.
 *
 * Scoped by the session supplier id like everything else here, so another
 * supplier's number does not resolve rather than resolving and being refused.
 */
export async function myDocketPlan(poNumber: string) {
  const { supplierId } = await requireSupplier();
  const po = await db.purchaseOrder.findFirst({
    where: { poNumber, supplierId, status: { not: "Draft" } },
    select: { id: true },
  });
  if (!po) return null;
  return docketPlan(po.id);
}

/**
 * Despatch, as one delivery docket.
 *
 * WHY THIS REPLACED A FLAG. It used to set status = Dispatched on the whole
 * order and write one courier and one tracking number. A supplier who could
 * send eight of ten today and the rest next week had no way to say so: the
 * second despatch overwrote the first, replacing the tracking number of a box
 * already in transit with one for a box that had not left, and the order read
 * as fully dispatched from the first consignment onwards.
 *
 * ONE MECHANISM, TWO ENTRY POINTS. Sending everything outstanding is not a
 * different operation from sending some of it — it is a docket that happens to
 * cover the remainder. Keeping a separate whole-order path would mean two ways
 * to dispatch and two places for the status rules to disagree.
 */
export async function markDispatched(
  id: string,
  input: DispatchInput
): Promise<Result<{ sequence: number; complete: boolean }>> {
  const actor = await requireSupplier();

  const allowed = await ensure("markDispatched");
  if (!allowed.ok) return allowed;

  const po = await loadOwn(id, actor.supplierId);

  if (!po) return fail("That purchase order is not one of yours.");
  if (po.status === "Draft") return fail("That purchase order has not been sent.");
  if (po.receivedAt) {
    return fail("It has already been received, so nothing further can be sent against it.");
  }

  const plan = await docketPlan(id);
  if (!plan) return fail("That purchase order no longer exists.");

  // No explicit lines is the supplier saying "all of it" — the remainder, not
  // the original quantities, so pressing it twice cannot send anything twice.
  const lines =
    input.lines ??
    plan.lines
      .filter((line) => line.outstanding > 0)
      .map((line) => ({ purchaseOrderLineId: line.id, qty: line.outstanding }));

  const result = await createDocket({
    purchaseOrderId: id,
    lines,
    courier: input.courier,
    trackingNumber: input.trackingNumber,
    note: input.note ?? null,
    dispatched: true,
    actor: { id: actor.id, name: actor.name, role: "Supplier" },
  });
  if (!result.ok) return result;

  await audit(
    actor,
    "purchaseOrder.docket",
    "PurchaseOrder",
    po.poNumber,
    { status: po.status },
    {
      docket: result.value.sequence,
      units: lines.reduce((n, l) => n + l.qty, 0),
      complete: result.value.complete,
      courier: (input.courier ?? "").trim() || null,
    }
  );

  return result;
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
      /*
       * RANK IS SHOWN AGAIN, at the client's request on 28 Aug 2026.
       *
       * It was on this screen until 24 Aug, when the client's decision was
       * that a supplier should not know where they stand — a backup who knows
       * they are the backup prices and prioritises differently, and one who is
       * demoted learns it from a screen rather than from us. That reasoning
       * has not changed; the client has weighed it and decided the other way,
       * on the grounds that a supplier who knows they are the primary knows
       * the order matters.
       *
       * Recorded here rather than quietly reverted, because the next person to
       * read this file will otherwise reinstate the old rule.
       *
       * Third is shown as Backup. From the supplier's side there are two
       * positions worth knowing — first call or not — and telling somebody
       * they are third rather than second is a distinction that only ever
       * reads as a demotion.
       */
      rank: true,
      costFils: true,
      // Their own outstanding request. Safe to show them — it is what they
      // asked for, and a supplier who cannot see that it is still waiting
      // assumes the new price took effect and invoices against it.
      proposedCostFils: true,
      proposedAt: true,
      supplierPartNumber: true,
      leadTimeDays: true,
      isAvailable: true,
      supplyStatus: true,
      alternativeSku: {
        select: {
          id: true,
          skuCode: true,
          unitLabel: true,
          product: { select: { name: true } },
        },
      },
      sku: {
        select: {
          skuCode: true,
          unitLabel: true,
          isActive: true,
          product: {
            select: {
              name: true,
              status: true,
              // The public address of the product, so a supplier can open the
              // listing a buyer sees. It is already public — this reveals
              // nothing they could not reach from the shop.
              slug: true,
              // One picture, so a supplier scanning forty rows can tell at a
              // glance which item a code refers to. Their part numbers rarely
              // match ours, and the wrong line marked discontinued takes a
              // product off sale for no reason.
              images: {
                orderBy: { sortOrder: "asc" },
                take: 1,
                select: { path: true, altText: true },
              },
            },
          },
        },
      },
    },
  });

  return supplies.map((supply) => ({
    id: supply.id,
    skuCode: supply.sku.skuCode,
    productName: supply.sku.product.name,
    productSlug: supply.sku.product.slug,
    unitLabel: supply.sku.unitLabel,
    /** Ours, not theirs: a retired pack explains why nothing is ordered. */
    listed: supply.sku.isActive && supply.sku.product.status === "Active",
    /**
     * Primary, Backup, or null where we have not given them cover.
     * Third is folded into Backup — see the note in the select above.
     */
    standing:
      supply.rank === "Primary"
        ? ("Primary" as const)
        : supply.rank === null
          ? null
          : ("Backup" as const),
    costFils: supply.costFils,
    /** Asked for, not agreed. Null when nothing is outstanding. */
    proposedCostFils: supply.proposedCostFils,
    proposedAt: supply.proposedAt,
    supplierPartNumber: supply.supplierPartNumber,
    leadTimeDays: supply.leadTimeDays,
    isAvailable: supply.isAvailable,
    supplyStatus: supply.supplyStatus,
    image: supply.sku.product.images[0]?.path ?? null,
    imageAlt: supply.sku.product.images[0]?.altText ?? null,
    alternative: supply.alternativeSku
      ? {
          id: supply.alternativeSku.id,
          label: `${supply.alternativeSku.product.name} · ${supply.alternativeSku.unitLabel}`,
          skuCode: supply.alternativeSku.skuCode,
        }
      : null,
  }));
}

export type MySupply = Awaited<ReturnType<typeof listMySupplies>>[number];

/**
 * Packs a supplier can offer as a replacement — from their own range only.
 *
 * My first version offered the whole live catalogue, reasoning that "we cannot
 * get the 100-box but the 50-box would do" is the useful case whoever ends up
 * sending it. check:privacy refused it, and was right: a dropdown listing
 * every pack we sell is a way for one supplier to read our entire range and,
 * through it, infer what a competitor supplies. That is a commercial problem,
 * not merely a privacy one, and BE-39 exists precisely to stop it.
 *
 * So it is their own supplies. The common case survives — a supplier out of
 * one pack size usually has another — and a replacement from outside their
 * range is a conversation with the buyer rather than a dropdown.
 *
 * Nothing about cost, margin or another supplier is selected. The item code is
 * not returned either: it is not rendered, and anything sent to the browser
 * that need not be is one more thing that can leak.
 */
export async function alternativeChoices() {
  const { supplierId } = await requireSupplier();

  const supplies = await db.productSupply.findMany({
    where: { supplierId, sku: { isActive: true, product: { status: "Active" } } },
    orderBy: [{ sku: { product: { name: "asc" } } }, { sku: { eachesPerPack: "asc" } }],
    select: {
      sku: {
        select: {
          id: true,
          unitLabel: true,
          product: { select: { name: true } },
        },
      },
    },
  });

  return supplies.map((supply) => ({
    id: supply.sku.id,
    label: `${supply.sku.product.name} · ${supply.sku.unitLabel}`,
  }));
}

/**
 * Updates one line's terms.
 *
 * Takes the supply row's id and checks it belongs to the session's supplier as
 * part of the lookup, not afterwards — someone else's id simply does not
 * resolve. Nothing here can create a supply row: which suppliers can supply
 * what is an admin decision, and a portal that could create the pairing would
 * let a supplier appoint themselves to a competitor's line.
 */
export type SupplyUpdate = SupplyTermsInput & {
  /** Available | OutOfStock | Discontinued. Anything else reads as Available. */
  supplyStatus?: string | null;
  /** Their suggested replacement, kept only while they cannot supply. */
  alternativeSkuId?: string | null;
  /*
   * No reason field.
   *
   * The form asked why the price was changing and the answer was optional, so
   * it was usually blank — an empty box on every edit, buying nothing. What
   * decides a price request is the movement and the line it is on, both of
   * which the approvals screen already shows. If a supplier wants to explain
   * themselves they ring, which is what they did anyway.
   *
   * priceIntent still takes a reason and the column still exists: the bulk
   * upload could carry one later, and dropping stored reasons would lose the
   * ones already recorded.
   */
};

export async function updateMySupply(
  supplyId: string,
  input: SupplyUpdate
): Promise<Result<string | null>> {
  const actor = await requireSupplier();

  const existing = await db.productSupply.findFirst({
    where: { id: supplyId, supplierId: actor.supplierId },
    select: {
      id: true,
      costFils: true,
      proposedCostFils: true,
      supplierPartNumber: true,
      leadTimeDays: true,
      isAvailable: true,
      sku: { select: { skuCode: true } },
    },
  });
  if (!existing) return fail("That item is not one you supply.");

  const checked = checkSupplyTerms(input);
  if (!checked.ok) return fail(checked.error);

  /*
   * This one form carries several separate permissions, so they are read once
   * and applied field by field.
   *
   * WHAT THEY MAY NOT CHANGE IS IGNORED, NOT REFUSED, and that is deliberate.
   * The portal hides a control a supplier does not have, and a hidden input
   * posts nothing — which down the ordinary path reads as "clear this field"
   * and would wipe a part number somebody spent a morning entering. Dropping
   * the field instead means the worst a stale form can do is nothing at all.
   */
  const may = writableSupplyFields(await supplierPermissions());

  /**
   * THE PRICE IS NOT NORMALLY THEIRS TO SET.
   *
   * Everything else on this form describes the item — their part number, how
   * long it takes to arrive, whether they have any. The supplier is the only
   * person who knows those, so they take effect at once. What we pay them is
   * an agreement between two companies, and one company changing it on a form
   * is not an agreement.
   *
   * So by default the cost is split off and held as a request: costFils is
   * untouched, and the buying run, the margin report and any purchase order
   * raised meanwhile all go on using the agreed figure until an admin says yes.
   * Roles and permissions can set changePrice to Allowed, which makes the
   * submitted figure take effect at once — a deliberate choice carrying a
   * warning, not the default.
   */
  const { costFils: requested, ...terms } = checked.terms;

  const appliesNow = may.terms ? terms : {};

  /*
   * Whether they have any, and what to buy instead.
   *
   * THIS WAS BEING DROPPED. The form has posted supplyStatus since the state
   * became three-way, and nothing here ever wrote it — availabilityFor and
   * keepsAlternative were imported at the top of this file and never called,
   * which is what gave it away. A supplier pressing "Out of stock" got a
   * success message and no change, and the buying run went on ordering from
   * them. Found while giving markOutOfStock something to gate: a permission
   * over a field nobody writes is a switch wired to nothing.
   *
   * isAvailable is never set on its own — supply-state.ts derives it from the
   * state, and db:check asserts the two agree.
   */
  const requestedState =
    typeof input.supplyStatus === "string" && isSupplyState(input.supplyStatus)
      ? input.supplyStatus
      : null;

  let stockData: Record<string, unknown> = {};
  if (requestedState && may.stock) {
    stockData = {
      supplyStatus: requestedState,
      isAvailable: availabilityFor(requestedState),
    };

    if (!keepsAlternative(requestedState)) {
      // Back in stock, so a replacement offered while they were not is advice
      // about a moment that has passed.
      stockData.alternativeSkuId = null;
    } else if (may.alternative) {
      stockData.alternativeSkuId = input.alternativeSkuId ?? null;
    }
  }

  let priceData: Record<string, unknown> = {};
  let auditAs = "supply.update";

  if (may.price === "agree") {
    if (requested !== existing.costFils) {
      // Agreed on the spot. Any outstanding request goes with it — leaving one
      // behind would put a line in the approvals queue asking permission for a
      // price that is already being paid.
      priceData = { costFils: requested, ...NO_PRICE_REQUEST };
      auditAs = "supply.price.set";
    }
  } else if (may.price === "request") {
    const intent = priceIntent(
      existing.costFils,
      existing.proposedCostFils,
      requested,
      null,
      actor.name,
      new Date()
    );
    priceData = intent.data;
    auditAs = intent.auditAs;
  }

  await db.productSupply.update({
    where: { id: supplyId },
    data: { ...appliesNow, ...stockData, ...priceData },
  });

  /*
   * Losing the primary slot, if that is what just happened.
   *
   * AFTER the write, not before: the demotion reads isAvailable off the other
   * cover rows to decide who can take over, and running it first would have it
   * deciding against a state that is about to change. It is also deliberately
   * not inside the same transaction — a failure to reshuffle ranks must not
   * roll back a supplier telling us they are out of stock, which is the more
   * important of the two facts and the one the buying run reads.
   */
  const demotion =
    stockData.isAvailable === false
      ? await demoteOutOfStockPrimary(supplyId, actor)
      : { promotedTo: null, message: null };

  await audit(
    actor,
    auditAs,
    "ProductSupply",
    existing.sku.skuCode,
    {
      costFils: existing.costFils,
      proposedCostFils: existing.proposedCostFils,
      supplierPartNumber: existing.supplierPartNumber,
      leadTimeDays: existing.leadTimeDays,
      isAvailable: existing.isAvailable,
    },
    { ...appliesNow, ...stockData, ...priceData }
  );

  return ok(demotion.message);
}


/**
 * The whole company in or out.
 *
 * Distinct from a single item being unavailable, and much blunter: while this
 * is off, every line where they are primary reverts to the backup. See DEC-25.
 */
export async function setMyAvailability(available: boolean): Promise<Result> {
  const actor = await requireSupplier();

  /*
   * Guarded in one direction only.
   *
   * Turning themselves back ON is always allowed. The permission exists to
   * stop a supplier taking themselves out of the buying run unilaterally; a
   * supplier who is off and wants to work again is not the situation anybody
   * meant to prevent, and refusing it would strand an account that the
   * permission was switched off after.
   */
  if (!available) {
    const allowed = await ensure("pauseAccount");
    if (!allowed.ok) return allowed;
  }

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

  /*
   * THE SAME PERMISSIONS AS THE FORM, AND FOR A BLUNTER REASON.
   *
   * This path writes every field the row form writes. Gating one and not the
   * other would mean a supplier refused a price change on screen could reprice
   * their entire range in a single upload — and the permissions panel would be
   * describing a rule the system does not keep.
   */
  const may = writableSupplyFields(await supplierPermissions());

  if (!may.terms && may.price === "no" && !may.stock) {
    return fail(
      "Updating your items by spreadsheet is not something your account can do. Get in touch and we will sort it out."
    );
  }

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
  let demoted = 0;
  for (const row of applicable) {
    const id = byCode.get(row.skuCode.toLowerCase());
    if (!id) continue;

    await db.productSupply.update({
      where: { id },
      data: {
        ...(may.terms
          ? {
              supplierPartNumber: row.supplierPartNumber,
              leadTimeDays: row.leadTimeDays,
            }
          : {}),
        // A price in a spreadsheet is a request, exactly as it is on the
        // form — see the note in updateMySupply — unless changePrice is set
        // to Allowed, in which case it is agreed, exactly as it is there.
        ...(may.price === "no"
          ? {}
          : may.price === "agree"
            ? {
                costFils: row.costFils,
                proposedCostFils: null,
                proposedAt: null,
                proposedByName: null,
              }
            : {
                proposedCostFils: row.costFils,
                proposedAt: row.costFils === null ? null : new Date(),
                proposedByName: row.costFils === null ? null : actor.name,
              }),
        // Blank means no change, so the current value is kept rather than
        // being defaulted to available.
        //
        // Both fields move together or neither does. Writing isAvailable alone
        // — which this did — would leave a row saying "discontinued" that the
        // buying run treats as orderable, and nothing on any screen would show
        // the disagreement. A spreadsheet can only say yes or no, so "yes"
        // means Available and "no" means out of stock: the milder of the two
        // reasons, since a supplier ending a line permanently should have to
        // say so on the screen where the word appears.
        ...(row.isAvailable === null || !may.stock
          ? {}
          : {
              isAvailable: row.isAvailable,
              supplyStatus: row.isAvailable ? "Available" : "OutOfStock",
              // A replacement offered while out of stock is advice about that
              // moment; left in place once they can supply again it becomes a
              // suggestion to buy the wrong thing.
              ...(row.isAvailable ? { alternativeSkuId: null } : {}),
            }),
      },
    });
    updated++;

    /*
     * The same demotion the row form applies.
     *
     * A supplier who can be demoted by pressing a button and not by uploading
     * a spreadsheet has been shown the way round it, and this is the path that
     * can take a whole range out of stock in one go.
     */
    if (row.isAvailable === false && may.stock) {
      const demotion = await demoteOutOfStockPrimary(id, actor);
      if (demotion.promotedTo) demoted++;
    }
  }

  await audit(actor, "supply.bulkUpdate", "Supplier", actor.supplierId, null, {
    updated,
    demoted,
    rejected: parsed.problems.length,
    notSupplied: notSupplied.length,
  });

  return ok({
    updated,
    problems: parsed.problems,
    notSupplied: notSupplied.map((row) => row.skuCode),
  });
}

/**
 * What a supplier says they can actually send, line by line.
 *
 * Three quantities and three different facts. qtyOrdered is what we asked for,
 * qtyConfirmed is what they promise, qtyReceived is what turns up. Before this
 * existed a supplier could only acknowledge the whole order or say nothing, so
 * "I can do eight of the ten" had to happen on the phone and never reached the
 * screen the buying run reads.
 *
 * NOT DEFAULTED. A line they have not touched stays null, which means "they
 * have not said" — different from a confirmed zero, which means "none of
 * these, stop waiting". Filling every line in silently would put a promise in
 * their mouth on every order.
 *
 * Refuses more than was ordered rather than clamping it: a supplier typing 100
 * against an order for 10 has misread something, and quietly storing 10 hides
 * the misunderstanding until the delivery arrives.
 */
export async function confirmQuantities(
  purchaseOrderId: string,
  quantities: { lineId: string; qty: number | null }[]
): Promise<Result> {
  const actor = await requireSupplier();
  const { supplierId } = actor;

  const allowed = await ensure("confirmQuantities");
  if (!allowed.ok) return allowed;

  // The supplier id is part of the lookup, so another supplier's order simply
  // does not resolve — the same rule getPurchaseOrder follows.
  const po = await db.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, supplierId },
    include: { lines: { select: { id: true, qtyOrdered: true, qtyReceived: true, nameSnapshot: true, docketLines: { select: { qty: true } } } } },
  });
  if (!po) return { ok: false, error: "That purchase order is not yours." };

  if (["Draft", "Received", "Cancelled"].includes(po.status)) {
    return {
      ok: false,
      error: "This order is closed, so what you can supply no longer changes it.",
    };
  }

  const byId = new Map(po.lines.map((l) => [l.id, l]));
  if (new Set(quantities.map(q => q.lineId)).size !== quantities.length) return fail("Choose each line once.");

  for (const { lineId, qty } of quantities) {
    const line = byId.get(lineId);
    if (!line) return { ok: false, error: "That line is not on this order." };
    if (qty === null) continue;
    if (!Number.isInteger(qty) || qty < 0) {
      return { ok: false, error: "A quantity has to be a whole number, zero or more." };
    }
    if (qty > line.qtyOrdered) {
      return {
        ok: false,
        error: `${line.nameSnapshot}: we only ordered ${line.qtyOrdered}. Enter that or fewer.`,
      };
    }
    const committed = Math.max(line.qtyReceived, line.docketLines.reduce((n, l) => n + l.qty, 0));
    if (qty < committed) return fail(`${line.nameSnapshot}: ${committed} units are already received or on a docket.`);
  }

  await db.$transaction(
    quantities.map(({ lineId, qty }) =>
      db.purchaseOrderLine.update({
        where: { id: lineId },
        data: { qtyConfirmed: qty, qtyReviewed: byId.get(lineId)!.qtyOrdered },
      })
    )
  );

  await audit(actor, "purchaseOrder.confirmQuantities", "PurchaseOrder", po.poNumber, null, { quantities });
  return { ok: true, value: undefined };
}
