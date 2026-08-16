import "server-only";

import { db } from "./db";
import type { Event } from "./lifecycle";

/**
 * Writing state changes down — BE-30, BE-31.
 *
 * One function, called from every place that changes a status, so a transition
 * cannot be made without being recorded. It never throws: a purchase order
 * that has been sent to a supplier is sent, and losing the measurement of it
 * is a smaller problem than refusing the action because a log write failed.
 * The failure is printed rather than swallowed silently.
 *
 * Nothing here updates or deletes. The value of this table is that it is the
 * one place in the application which only ever grows.
 */

export type EntityKind = "Order" | "OrderItem" | "PurchaseOrder" | "ProductSku";

export type Actor = {
  id?: string | null;
  name?: string | null;
  role?: "Admin" | "Supplier" | "Customer" | "System";
} | null;

export async function recordStatus(input: {
  entity: EntityKind;
  entityId: string;
  entityRef?: string | null;
  fromStatus?: string | null;
  toStatus: string;
  actor?: Actor;
  /** For backfilling a known moment; defaults to now. */
  at?: Date;
}): Promise<void> {
  try {
    await db.statusEvent.create({
      data: {
        entity: input.entity,
        entityId: input.entityId,
        entityRef: input.entityRef ?? null,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus,
        actorUserId: input.actor?.id ?? null,
        actorName: input.actor?.name ?? null,
        actorRole: input.actor?.role ?? "System",
        ...(input.at ? { at: input.at } : {}),
      },
    });
  } catch (error) {
    // Never let measurement break the thing being measured.
    console.error("[status] could not record a transition:", error);
  }
}

/** The history of one thing, oldest first, in the shape lifecycle.ts wants. */
export async function historyOf(
  entity: EntityKind,
  entityId: string
): Promise<(Event & { actorName: string | null; actorRole: string })[]> {
  const rows = await db.statusEvent.findMany({
    where: { entity, entityId },
    orderBy: { at: "asc" },
  });

  return rows.map((row) => ({
    toStatus: row.toStatus,
    fromStatus: row.fromStatus,
    at: row.at.getTime(),
    actorName: row.actorName,
    actorRole: row.actorRole,
  }));
}

/** Histories for many things at once, so a summary is one query not N. */
export async function historiesOf(
  entity: EntityKind,
  entityIds: string[]
): Promise<Map<string, Event[]>> {
  if (entityIds.length === 0) return new Map();

  const rows = await db.statusEvent.findMany({
    where: { entity, entityId: { in: entityIds } },
    orderBy: { at: "asc" },
    select: { entityId: true, toStatus: true, fromStatus: true, at: true },
  });

  const byId = new Map<string, Event[]>();
  for (const row of rows) {
    const list = byId.get(row.entityId) ?? [];
    list.push({
      toStatus: row.toStatus,
      fromStatus: row.fromStatus,
      at: row.at.getTime(),
    });
    byId.set(row.entityId, list);
  }
  return byId;
}
