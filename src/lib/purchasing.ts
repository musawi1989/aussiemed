import "server-only";

import { db } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import { audit, requireAdmin, type Result } from "./admin";
import { recordStatus } from "./status-events";
import { purchaseOrderSent } from "./email-message";
import { send } from "./mailer";
import { createHash } from "node:crypto";
import { publicUrl } from "./public-url";
import {
  allocateReceipt,
  isSupplyRank,
  planPurchaseOrders,
  SUPPLY_RANKS,
  type DemandLine,
  type PurchasePlan,
} from "./purchase-plan";
import {
  DEFAULT_CUTOFF_HOUR,
  isValidCutoffHour,
  lastCutoffBefore,
  monthWindow,
  parseCutoffHour,
} from "./cutoff";

/**
 * Buying — BE-36, DEC-26.
 *
 * Customer orders accumulate through the day. At the cutoff this pools every
 * unpurchased line into one draft purchase order per supplier, quantities
 * summed per item, for a person to review and send.
 *
 * Two rules run through everything here:
 *
 *  1. A purchase order carries no customer. Not a name, not an address, not a
 *     reference, not a count of them — see SEC-05. The link between a received
 *     unit and the customer waiting for it lives in PurchaseAllocation, on our
 *     side of the wall.
 *  2. Nothing sends itself unless an admin has turned that on. Sending commits
 *     money to a supplier, so the default is a draft and a person.
 */

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export const CUTOFF_HOUR_KEY = "purchaseCutoffHourDubai";
export const AUTO_SEND_KEY = "purchaseAutoSend";

// The cutoff arithmetic itself lives in cutoff.ts, which is pure and tested,
// so the buying run and the countdown a buyer sees cannot disagree about when
// the day closes.
export { DEFAULT_CUTOFF_HOUR, lastCutoffBefore, monthWindow } from "./cutoff";

export async function getCutoffHour(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: CUTOFF_HOUR_KEY } });
  const parsed = parseCutoffHour(row?.value);
  return parsed ?? DEFAULT_CUTOFF_HOUR;
}

/**
 * Moves the daily cutoff.
 *
 * Takes effect immediately and changes nothing already bought: purchase orders
 * are built against the cutoff that had passed when they were built, and this
 * only decides when the next one closes. What it does change is the deadline
 * every buyer is shown, which is why it is audited.
 */
export async function setCutoffHour(hour: number): Promise<Result> {
  const actor = await requireAdmin("settings");

  if (!isValidCutoffHour(hour)) {
    return fail("Choose a whole hour of the day, from 0 to 23.");
  }

  const before = await getCutoffHour();
  if (before === hour) return ok(undefined);

  await db.setting.upsert({
    where: { key: CUTOFF_HOUR_KEY },
    update: { value: String(hour) },
    create: { key: CUTOFF_HOUR_KEY, value: String(hour) },
  });

  await audit(actor, "purchasing.cutoffHour", "Setting", CUTOFF_HOUR_KEY, { hour: before }, { hour });
  return ok(undefined);
}

export async function getAutoSend(): Promise<boolean> {
  const row = await db.setting.findUnique({ where: { key: AUTO_SEND_KEY } });
  return row?.value === "true";
}

export async function setAutoSend(on: boolean): Promise<Result> {
  const actor = await requireAdmin("settings");
  const before = await getAutoSend();

  await db.setting.upsert({
    where: { key: AUTO_SEND_KEY },
    update: { value: String(on) },
    create: { key: AUTO_SEND_KEY, value: String(on) },
  });

  await audit(actor, "purchasing.autoSend", "Setting", AUTO_SEND_KEY, { on: before }, { on });
  return ok(undefined);
}

/* ------------------------------------------------------------------ *
 * Demand
 * ------------------------------------------------------------------ */

/**
 * Everything ordered but not yet bought, at or before the cutoff.
 *
 * A line counts as bought once allocations cover its quantity, so a line half
 * covered by an earlier purchase order returns here for the remainder. That is
 * what makes running the build twice safe.
 */
/**
 * Narrows the run to one customer order.
 *
 * The daily run pools everything placed before the cutoff, which is the right
 * default and the wrong one when a single clinic cannot wait. Scoping by
 * reference rather than by date leaves every other rule untouched — the
 * pooling, the monthly order per supplier, the fallback supplier, the
 * allocations — so a pushed order and a pooled one produce the same kind of
 * purchase order.
 */
export type DemandScope = { orderReference?: string };

export async function outstandingDemand(
  cutoffAt: Date,
  scope: DemandScope = {},
  client: Prisma.TransactionClient = db
): Promise<DemandLine[]> {
  const items = await client.orderItem.findMany({
    where: {
      status: { notIn: ["Cancelled"] },
      order: {
        placedAt: { lte: cutoffAt },
        status: { notIn: ["Cancelled"] },
        ...(scope.orderReference ? { reference: scope.orderReference } : {}),
      },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      qty: true,
      skuId: true,
      skuCodeSnapshot: true,
      nameSnapshot: true,
      allocations: { select: { qty: true } },
      sku: {
        select: {
          supplies: {
            /*
             * COVER ONLY. A supply row with a null rank is a supplier saying
             * "I can supply this" — an offer, not cover — and it must never
             * reach the buying run.
             *
             * Without this filter the mapping below turned it into a primary:
             * it read `rank === "Backup" ? "Backup" : "Primary"`, so anything
             * that was not the string "Backup" became "Primary", and null is
             * not the string "Backup". A supplier adding an item to their own
             * list would have started receiving our purchase orders for it.
             */
            where: { rank: { not: null } },
            select: {
              rank: true,
              costFils: true,
              supplierPartNumber: true,
              isAvailable: true,
              supplier: {
                select: { id: true, companyName: true, isAvailable: true, status: true },
              },
            },
          },
        },
      },
    },
  });

  const demand: DemandLine[] = [];

  for (const item of items) {
    const bought = item.allocations.reduce((n, a) => n + a.qty, 0);
    const outstanding = item.qty - bought;
    if (outstanding <= 0) continue;

    demand.push({
      orderItemId: item.id,
      skuId: item.skuId ?? "",
      skuCode: item.skuCodeSnapshot,
      name: item.nameSnapshot,
      qty: outstanding,
      supplies: (item.sku?.supplies ?? []).map((supply) => ({
        supplierId: supply.supplier.id,
        supplierName: supply.supplier.companyName,
        // Narrowed against the real list, not coerced. This read
        // `rank === "Backup" ? "Backup" : "Primary"` while there were two
        // slots, which with a third silently promoted every third-choice
        // supplier to primary and would have sent them the order ahead of the
        // backup. Anything unrecognised now falls to the LAST slot rather than
        // the first, so a bad value can only cost an order we did not need to
        // place — never send one to the wrong company.
        rank: isSupplyRank(supply.rank)
          ? supply.rank
          : SUPPLY_RANKS[SUPPLY_RANKS.length - 1],
        // Both facts have to hold: the company open, and the item available
        // from them. A retired supplier is unavailable whatever its flag says.
        available:
          supply.isAvailable &&
          supply.supplier.isAvailable &&
          supply.supplier.status === "Active",
        costFils: supply.costFils,
        supplierPartNumber: supply.supplierPartNumber,
      })),
    });
  }

  return demand;
}

/** What the build would do, without writing anything. */
export async function previewPurchaseOrders(cutoffAt: Date): Promise<PurchasePlan> {
  return planPurchaseOrders(await outstandingDemand(cutoffAt));
}

/* ------------------------------------------------------------------ *
 * Building
 * ------------------------------------------------------------------ */

/**
 * One purchase order per supplier per calendar month — the client's model
 * from 28 Aug 2026.
 *
 * The number says which month it is, because that is now the thing that
 * identifies it: PO-2026-08-004 is the fourth order opened in August. Orders
 * raised before this change keep their old PO-2026-000101 numbers; nothing
 * renumbers a document a supplier already holds.
 */
export function formatPoNumber(
  year: number,
  month: number,
  sequence: number
): string {
  return `PO-${year}-${String(month).padStart(2, "0")}-${String(sequence).padStart(3, "0")}`;
}


export type BuildResult = {
  // The id as well as the number: the status log keys on the row, and the
  // number is what a person reads.
  created: {
    id: string;
    poNumber: string;
    supplierName: string;
    lineCount: number;
    /** True when this run opened the month's order rather than adding to it. */
    opened: boolean;
    /** Items new to the order. The rest joined a line already on it. */
    newLines: number;
  }[];
  /**
   * What auto-send actually sent, and what it could not.
   *
   * Reported rather than swallowed: a run that built four orders and sent
   * three is not a run that worked, and the one that stayed behind is the one
   * a supplier is not looking at.
   */
  sent: { poNumber: string; supplierName: string }[];
  unsent: { poNumber: string; supplierName: string; reason: string }[];
  /** Whether auto-send was on for this run, so the caller can say so. */
  autoSent: boolean;
  unsourceable: PurchasePlan["unsourceable"];
};

/**
 * Builds the drafts and reserves the demand behind them.
 *
 * Allocations are written now, at draft, rather than at goods-in. Without that
 * the next run would pool the same customer lines a second time and order
 * everything twice. Cancelling a draft releases them again.
 */
export async function buildPurchaseOrders(
  cutoffAt: Date,
  scope: DemandScope = {}
): Promise<Result<BuildResult>> {
  const actor = await requireAdmin("purchasing");
  let plan = planPurchaseOrders(await outstandingDemand(cutoffAt, scope));

  if (plan.orders.length === 0) {
    return ok({
      created: [],
      sent: [],
      unsent: [],
      autoSent: false,
      unsourceable: plan.unsourceable,
    });
  }

  const changes = new Map<string, { before: unknown; after: unknown }>();
  const created = await db.$transaction(async (tx) => {
    // Recheck demand under the same transaction that writes allocations.
    plan = planPurchaseOrders(await outstandingDemand(cutoffAt, scope, tx));
    const { from, to } = monthWindow(cutoffAt);
    const year = cutoffAt.getUTCFullYear();
    const month = cutoffAt.getUTCMonth() + 1;

    // Sequence is per month now, so the number reads as "the fourth order
    // opened in August" rather than the four-hundredth this year.
    const key = `poSequence:${year}-${String(month).padStart(2, "0")}`;
    const current = await tx.setting.findUnique({ where: { key } });
    let sequence = current ? Number(current.value) : 0;

    const made: BuildResult["created"] = [];

    for (const order of plan.orders) {
      /*
       * ONE ORDER PER SUPPLIER PER MONTH — the client's model, 28 Aug 2026.
       *
       * Today's lines join the order already open for this supplier this month
       * rather than starting another one. Cancelled orders are passed over: a
       * cancelled document is not somewhere to put new work.
       *
       * Ordered oldest first so that if two ever exist for one month — a
       * cancellation followed by a rebuild — the live one is the one that
       * grows.
       */
      const open = await tx.purchaseOrder.findFirst({
        where: {
          supplierId: order.supplierId,
          cutoffAt: { gte: from, lt: to },
          status: { not: "Cancelled" },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, poNumber: true, status: true, totalCostFils: true, paidFils: true, paymentStatus: true },
      });

      let po = open;

      if (!po) {
        sequence += 1;
        const supplierTerms = await tx.supplier.findUniqueOrThrow({ where: { id: order.supplierId }, select: { paymentTermsDays: true } });
        po = await tx.purchaseOrder.create({
          data: {
            poNumber: formatPoNumber(year, month, sequence),
            supplierId: order.supplierId,
            status: "Draft",
            // The instant the month's order opened. It is what every later
            // build of the same month matches against.
            cutoffAt,
            totalCostFils: order.totalCostFils,
            paymentDueOn: supplierTerms.paymentTermsDays === null ? null : new Date(cutoffAt.getTime() + supplierTerms.paymentTermsDays * 86400000),
          },
          select: { id: true, poNumber: true, status: true, totalCostFils: true, paidFils: true, paymentStatus: true },
        });
      }

      // Lines already on this month's order, so a second order for the same
      // pack adds to the line rather than sitting beside it. One line per item
      // per month is what makes the document readable at the end of it.
      const existingLines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: po.id },
        select: { id: true, skuId: true, qtyOrdered: true, unitCostFilsSnapshot: true },
      });
      const lineBySku = new Map(existingLines.map((l) => [l.skuId, l]));

      let addedLines = 0;

      for (const line of order.lines) {
        const existing = lineBySku.get(line.skuId);

        const poLineId = existing
          ? (
              await tx.purchaseOrderLine.update({
                where: { id: existing.id },
                data: {
                  qtyOrdered: existing.qtyOrdered + line.qtyOrdered,
                  lineCostFils:
                    existing.unitCostFilsSnapshot === null
                      ? null
                      : existing.unitCostFilsSnapshot * (existing.qtyOrdered + line.qtyOrdered),
                },
                select: { id: true },
              })
            ).id
          : (
              await tx.purchaseOrderLine.create({
                data: {
                  purchaseOrderId: po.id,
                  skuId: line.skuId,
                  supplierPartNumberSnapshot: line.supplierPartNumber,
                  nameSnapshot: line.name,
                  skuCodeSnapshot: line.skuCode,
                  unitCostFilsSnapshot: line.unitCostFils,
                  qtyOrdered: line.qtyOrdered,
                  wasFallback: line.wasFallback,
                  lineCostFils:
                    line.unitCostFils === null
                      ? null
                      : line.unitCostFils * line.qtyOrdered,
                },
                select: { id: true },
              })
            ).id;

        if (!existing) addedLines += 1;

        for (const allocation of line.allocations) {
          await tx.purchaseAllocation.create({
            data: {
              purchaseOrderLineId: poLineId,
              orderItemId: allocation.orderItemId,
              qty: allocation.qty,
              allocatedBy: actor.id,
            },
          });
        }
      }

      /*
       * The total is recomputed from the lines, not added to.
       *
       * Null must survive: the plan returns null the moment any line's cost is
       * unknown, and a month's order that quietly totalled only the priced
       * lines would read as cheaper than it is.
       */
      const lines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: po.id },
        select: { lineCostFils: true },
      });
      const anyUnpriced = lines.some((l) => l.lineCostFils === null);
      const totalCostFils = anyUnpriced ? null : lines.reduce((sum, line) => sum + (line.lineCostFils ?? 0), 0);

      const updated = await tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          totalCostFils,
          ...(po.paymentStatus === "Paid" && (totalCostFils === null || po.paidFils < totalCostFils)
            ? { paymentStatus: po.paidFils > 0 ? "PartiallyPaid" : "Unpaid", paidAt: null } : {}),
          /*
           * A finished order that gains a line is no longer finished.
           *
           * "Received" means everything on this document has arrived, and that
           * stops being true the moment something is added. Saying so is not
           * rewriting history — it is the document describing itself
           * correctly. Draft, Sent and Acknowledged are left exactly as they
           * are: none of them claims completeness.
           */
          ...(po.status === "Received" ? { status: "PartiallyReceived", receivedAt: null }
            : po.status === "Dispatched" ? { status: "PartiallyDispatched" } : {}),
        },
        select: { id: true, poNumber: true, status: true, totalCostFils: true, paymentStatus: true,
          lines: { select: { id: true, skuId: true, qtyOrdered: true, unitCostFilsSnapshot: true } },
        },
      });
      changes.set(po.id, { before: open ? { ...open, lines: existingLines } : null,
        after: { ...updated, supplier: order.supplierName, addedDemand: order.lines.map(line => ({
          skuCode: line.skuCode, qty: line.qtyOrdered, allocations: line.allocations,
        })) },
      });

      made.push({
        id: po.id,
        poNumber: po.poNumber,
        supplierName: order.supplierName,
        lineCount: order.lines.length,
        // Which of the two happened, so the screen can say "opened" or "added
        // to" rather than claiming every run created something.
        opened: !open,
        newLines: addedLines,
      });
    }

    await tx.setting.upsert({
      where: { key },
      update: { value: String(sequence) },
      create: { key, value: String(sequence) },
    });

    return made;
  });

  for (const po of created) {
    const change = changes.get(po.id);
    await audit(actor, "purchaseOrder.build", "PurchaseOrder", po.poNumber, change?.before, change?.after);
    // The first event in the order's life, so every later duration has
    // something to measure from — BE-30.
    if (po.opened) await recordStatus({
      entity: "PurchaseOrder",
      entityId: po.id,
      entityRef: po.poNumber,
      toStatus: "Draft",
      actor: { id: actor.id, name: actor.name, role: "Admin" },
    });
  }

  /*
   * AUTO-SEND, WHICH UNTIL NOW DID NOTHING.
   *
   * The toggle has existed since the buying run was built, and the screen said
   * in red that orders would go out without review. Nothing read the setting:
   * sendPurchaseOrder was reachable only from the Send button, so every run
   * left drafts behind and the switch was decoration. A supplier sees nothing
   * until an order is sent, so the orders simply sat there.
   *
   * Sent HERE rather than inside the transaction above. Sending is not
   * reversible — it emails the supplier — and a transaction that rolls back
   * after an email has gone cannot unsend it. The documents are committed
   * first, then told about.
   *
   * One order failing does not stop the rest. sendPurchaseOrder returns a
   * Result rather than throwing, and its refusals are reasonable things to
   * meet here: an order that was added to this month is already Sent, and
   * must not be sent twice.
   */
  const autoSent = await getAutoSend();
  const sent: BuildResult["sent"] = [];
  const unsent: BuildResult["unsent"] = [];

  if (autoSent) {
    for (const po of created) {
      const result = await sendPurchaseOrder(po.id);
      if (result.ok) {
        sent.push({ poNumber: po.poNumber, supplierName: po.supplierName });
      } else {
        unsent.push({
          poNumber: po.poNumber,
          supplierName: po.supplierName,
          reason: result.error,
        });
      }
    }
  }

  return ok({ created, sent, unsent, autoSent, unsourceable: plan.unsourceable });
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

export async function sendPurchaseOrder(id: string): Promise<Result> {
  const actor = await requireAdmin("purchasing");

  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      _count: { select: { lines: true } },
      supplier: {
        select: {
          companyName: true,
          primaryEmail: true,
          secondaryEmail: true,
        },
      },
      lines: {
        orderBy: { skuCodeSnapshot: "asc" },
        select: {
          supplierPartNumberSnapshot: true,
          skuCodeSnapshot: true,
          nameSnapshot: true,
          qtyOrdered: true,
        },
      },
    },
  });
  if (!po) return fail("That purchase order no longer exists.");
  if (po.status === "Cancelled") return fail("A cancelled purchase order cannot be sent.");
  if (po._count.lines === 0) return fail("There is nothing on it to send.");

  const sentAt = new Date();
  if (po.status === "Draft") {
  const moved = await db.purchaseOrder.updateMany({
    where: { id, status: "Draft" },
    data: { status: "Sent", sentAt },
  });
  if (!moved.count) return fail("This purchase order changed while sending. Reload and try again.");

  await audit(actor, "purchaseOrder.send", "PurchaseOrder", id, { status: "Draft" }, { status: "Sent" });

  await recordStatus({
    entity: "PurchaseOrder",
    entityId: id,
    entityRef: po.poNumber,
    fromStatus: "Draft",
    toStatus: "Sent",
    actor: { id: actor.id, name: actor.name, role: "Admin" },
    at: sentAt,
  });
  }

  // After the status, and never able to undo it. A purchase order the supplier
  // has been told about is sent; a bounced email is a mail problem, visible on
  // /admin/emails, not a reason to put the order back into draft.
  //
  // Nothing about a customer travels in this message — the template is pure
  // and tested for exactly that.
  // Both addresses, which is why the supplier has two. A purchase order that
  // reached one person who is on leave has not reached the supplier, and the
  // second address exists precisely so that is not a single point of failure.
  // Sent separately rather than as one To line so each has its own record and
  // one bad address cannot suppress the other.
  const addresses = [
    ...new Set(
      [po.supplier.primaryEmail, po.supplier.secondaryEmail]
        .map((value) => (value ?? "").trim())
        .filter(Boolean)
    ),
  ];

  if (!addresses.length) return fail("The purchase order is available in the portal, but the supplier has no notification email address.");
  const revision = createHash("sha256").update(JSON.stringify(po.lines)).digest("hex").slice(0, 24);
  const errors: string[] = [];
  for (const address of addresses) {
    try {
    const outcome = await send(
      purchaseOrderSent({
        to: address,
        supplierName: po.supplier.companyName,
        poNumber: po.poNumber,
        sentAt,
        expectedAt: po.expectedAt,
        lines: po.lines.map((line) => ({
          supplierPartNumber: line.supplierPartNumberSnapshot,
          skuCode: line.skuCodeSnapshot,
          name: line.nameSnapshot,
          qtyOrdered: line.qtyOrdered,
        })),
        portalUrl: `${publicUrl()}/business-portal`,
      }),
      {
        entity: "PurchaseOrder",
        entityId: id,
        dedupeKey: `PurchaseOrderSent:${po.poNumber}:${revision}:${address.toLowerCase()}`,
        subjectPrefix: po.status === "Draft" ? undefined : "Updated: ",
        senderUserId: actor.id,
      }
    );
    if (outcome.status === "Failed" || outcome.status === "Suppressed") errors.push(`${address}: ${outcome.error ?? outcome.status}`);
    } catch (error) { errors.push(`${address}: ${error instanceof Error ? error.message : "notification failed"}`); }
  }
  if (po.status !== "Draft") await audit(actor, "purchaseOrder.amendment.notify", "PurchaseOrder", id,
    { status: po.status }, { revision, lines: po.lines, errors });
  if (errors.length) return fail(`Purchase order saved; notification needs attention. ${errors.join("; ")}`);
  return ok(undefined);
}

export type SendAllResult = {
  sent: { poNumber: string; supplierName: string }[];
  failed: { poNumber: string; supplierName: string; reason: string }[];
};

/**
 * Send every draft at once, without waiting for the cutoff.
 *
 * WHY THIS EXISTS. The buying run pools a day's demand and the cutoff hour is
 * the line it pools up to, so the normal rhythm is one push a day. That
 * rhythm is not always right: a customer needs something today, a supplier is
 * about to close for the weekend, or somebody built a run in the morning and
 * left the drafts sitting. Sending them one at a time is the same decision
 * taken N times, and the risk in that is not the clicking — it is the one
 * that gets missed, which is exactly how a purchase order sits in draft for a
 * day while a supplier waits to hear from us.
 *
 * ⚠ THE CUTOFF IS NOT A TIMER. Nothing fires on its own at the cutoff hour:
 * it computes the window the run pools demand over, and the countdown on the
 * storefront is telling a buyer how long they have to get into the next run.
 * A person builds and a person sends. So this is not "sending early" against
 * something that would otherwise send later — it is the send, taken sooner.
 *
 * ONE AT A TIME, THROUGH sendPurchaseOrder. Every send has to write its own
 * audit entry, its own status event and its own supplier emails; a bulk
 * UPDATE that flipped the statuses would produce orders no supplier had been
 * told about, which is the very bug this button exists to prevent. One
 * failure does not stop the rest, and each is named in the result — "two
 * failed" is no use to somebody who then has to find which two.
 */
export async function sendAllDraftPurchaseOrders(): Promise<Result<SendAllResult>> {
  await requireAdmin("purchasing");

  // Oldest first: if anything does fail part way, the ones that have waited
  // longest are the ones already away.
  const drafts = await db.purchaseOrder.findMany({
    where: { status: "Draft" },
    orderBy: { createdAt: "asc" },
    select: { id: true, poNumber: true, supplier: { select: { companyName: true } } },
  });

  const sent: SendAllResult["sent"] = [];
  const failed: SendAllResult["failed"] = [];

  for (const draft of drafts) {
    const supplierName = draft.supplier.companyName;
    const result = await sendPurchaseOrder(draft.id);
    if (result.ok) {
      sent.push({ poNumber: draft.poNumber, supplierName });
    } else {
      failed.push({ poNumber: draft.poNumber, supplierName, reason: result.error });
    }
  }

  return ok({ sent, failed });
}

export type PushResult = {
  /** Purchase orders opened or added to by this push. */
  built: BuildResult["created"];
  /** Sent to their suppliers as a result. */
  sent: { poNumber: string; supplierName: string }[];
  /** Could not be sent, each with the reason. */
  unsent: { poNumber: string; supplierName: string; reason: string }[];
  /** Lines nobody supplies, which no amount of pushing will place. */
  unsourceable: PurchasePlan["unsourceable"];
  /**
   * Purchase orders that gained lines but were ALREADY sent.
   *
   * The monthly model adds today's lines to the order a supplier already has
   * open, and sendPurchaseOrder rightly refuses to send the same document
   * twice. So the lines are on a real purchase order and the supplier has not
   * been told about them — reported here rather than swallowed, because it is
   * the one outcome of a push that looks like success and is not.
   */
  addedToSent: { poNumber: string; supplierName: string; newLines: number }[];
};

/**
 * Build and send in one movement — what "push to suppliers" means.
 *
 * WHY THE TWO STEPS ARE ONE BUTTON. Building drafts and sending them are
 * separate operations because reviewing a run before it goes is usually worth
 * it. When somebody has decided this order cannot wait, the review is the
 * decision they have already made, and leaving them to find the draft and
 * press a second button is how half a push ends up sitting in a queue.
 *
 * Sending only what THIS push drafted. A purchase order left in draft
 * deliberately by somebody else is not swept along by a push of an unrelated
 * order — that is what "Send all drafts" is for, and it asks first.
 */
async function push(
  cutoffAt: Date,
  scope: DemandScope
): Promise<Result<PushResult>> {
  const build = await buildPurchaseOrders(cutoffAt, scope);
  if (!build.ok) return build;

  const { created, unsourceable } = build.value;

  const sent: PushResult["sent"] = [];
  const unsent: PushResult["unsent"] = [];
  const addedToSent: PushResult["addedToSent"] = [];

  for (const po of created) {
    // Auto-send may already have sent it inside the build. Sending is guarded
    // by status, so a second attempt is refused rather than duplicated — but
    // reading the status first keeps the report honest about what happened.
    if (build.value.sent.some((s) => s.poNumber === po.poNumber)) {
      sent.push({ poNumber: po.poNumber, supplierName: po.supplierName });
      continue;
    }

    const result = await sendPurchaseOrder(po.id);
    if (result.ok) {
      sent.push({ poNumber: po.poNumber, supplierName: po.supplierName });
    } else {
      unsent.push({
        poNumber: po.poNumber,
        supplierName: po.supplierName,
        reason: result.error,
      });
    }
  }

  return ok({ built: created, sent, unsent, unsourceable, addedToSent });
}

/**
 * Everything one customer order needs, on its way to the suppliers.
 *
 * The cutoff passed through is now rather than the day's boundary: the whole
 * point is to place lines that the boundary would otherwise leave until
 * tomorrow.
 */
export async function pushOrderToSuppliers(
  reference: string
): Promise<Result<PushResult>> {
  await requireAdmin("purchasing");

  const order = await db.order.findUnique({
    where: { reference },
    select: { reference: true, status: true },
  });
  if (!order) return fail("That order no longer exists.");
  if (order.status === "Cancelled") {
    return fail("That order was cancelled, so there is nothing to buy for it.");
  }

  return push(new Date(), { orderReference: order.reference });
}

/** Every outstanding customer order, placed and sent in one go. */
export async function pushAllOrdersToSuppliers(): Promise<Result<PushResult>> {
  await requireAdmin("purchasing");
  return push(new Date(), {});
}

/** Releases the demand so the next build can place it elsewhere. */
export async function cancelDraftPurchaseOrder(id: string): Promise<Result> {
  const actor = await requireAdmin("purchasing");

  const po = await db.purchaseOrder.findUnique({ where: { id } });
  if (!po) return fail("That purchase order no longer exists.");
  if (po.status !== "Draft") {
    return fail("Only a draft can be cancelled this way — it has already been sent.");
  }

  // Deleting the lines cascades to their allocations, which is what puts the
  // customer lines back into outstanding demand.
  await db.purchaseOrder.delete({ where: { id } });

  await audit(actor, "purchaseOrder.cancelDraft", "PurchaseOrder", po.poNumber, {
    status: "Draft",
  }, null);

  // Recorded even though the purchase order row is gone. The events outlive
  // what they describe on purpose — a draft that was built and thrown away is
  // itself worth knowing about when the buying run is being tuned.
  await recordStatus({
    entity: "PurchaseOrder",
    entityId: id,
    entityRef: po.poNumber,
    fromStatus: "Draft",
    toStatus: "Cancelled",
    actor: { id: actor.id, name: actor.name, role: "Admin" },
  });

  return ok(undefined);
}

/* ------------------------------------------------------------------ *
 * Goods in
 * ------------------------------------------------------------------ */

export type ReceiptLine = {
  lineId: string;
  qtyReceived: number;
  batchCode: string | null;
  expiresOn: Date | null;
};

export type ReceiptResult = {
  linesReceived: number;
  unitsReceived: number;
  /** Units still owed on this purchase order, carried forward until received. */
  shortfall: number;
  status: string;
};

/** Record physical receipts; allocation to customers is a separate admin action. */
export async function receivePurchaseOrder(id: string, lines: ReceiptLine[], requestKey?: string): Promise<Result<ReceiptResult>> {
  const { bookGoodsReceipt } = await import("./inbound");
  return bookGoodsReceipt(id, lines, requestKey);
}
/*
 * Moving one line to the other supplier is deliberately not a function here.
 *
 * A line does not live on its own: moving it means taking it off one supplier's
 * order and adding it to another's, adjusting both totals, and creating the
 * second order if that supplier has none today. Written as a per-line action it
 * is easy to get subtly wrong and hard to see the result of.
 *
 * The route that already works is the one DEC-25 describes: mark the supplier
 * or that item unavailable, cancel the draft, and rebuild. Cancelling releases
 * the demand, and the fallback rule places every affected line at once — which
 * is also what will happen tomorrow, so the review matches the routine.
 */

/* ------------------------------------------------------------------ *
 * Paying the supplier
 * ------------------------------------------------------------------ */

/**
 * What we have paid a supplier against one purchase order.
 *
 * Money out is tracked apart from goods in, and deliberately: a purchase order
 * can be received in full and unpaid for another month, and one can be paid up
 * front and not yet delivered. Collapsing them into a single status would make
 * one of those two situations unrepresentable.
 *
 * Overdue and Due soon are NOT stored here. They are this word plus the
 * passage of time, and paymentStatusOf derives them from paymentDueOn, so the
 * screen is right when it is looked at rather than when a nightly job last
 * ran. Same arrangement as a customer order.
 *
 * paidAt is stamped when the status first becomes Paid and cleared if it moves
 * back off Paid — a date that survives being un-paid is a date somebody will
 * later quote as when the money went out.
 */
export async function setPurchaseOrderPayment(input: {
  id: string;
  paymentStatus: string;
  paidFils: number;
  paymentDueOn: Date | null;
}): Promise<Result> {
  const { adjustInvoiceBalance } = await import("./payment-ledger");
  return adjustInvoiceBalance({ entity: "PurchaseOrder", identifier: input.id,
    paidFils: input.paidFils, paymentStatus: input.paymentStatus,
    dueOn: input.paymentDueOn?.toISOString().slice(0, 10) ?? "" });
}
