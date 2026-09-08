import "server-only";
import { db } from "./db";
import { type Result } from "./admin";
import { requireDocketActor } from "./docket-access";
import { checkDocket, statusAfterDocket, type ProposedDocketLine } from "./docket-maths";

export async function updateDocket(input: {
  id: string; lines: ProposedDocketLine[]; courier: string; trackingNumber: string;
  dispatched: boolean; note: string; reason: string;
}): Promise<Result<{ poNumber: string }>> {
  const record = await db.purchaseOrderDocket.findUnique({ where: { id: input.id }, select: { purchaseOrderId: true } });
  if (!record) return { ok: false, error: "That docket no longer exists." };
  const actor = await requireDocketActor(record.purchaseOrderId);
  if (input.reason.trim().length < 8) return { ok: false, error: "Record a short reason for this docket update." };
  if (input.courier.length > 200 || input.trackingNumber.length > 200 || input.note.length > 2000 || input.reason.length > 2000) {
    return { ok: false, error: "Courier and tracking must be under 200 characters; notes and reasons under 2,000." };
  }
  try {
    const poNumber = await db.$transaction(async (tx) => {
      const before = await tx.purchaseOrderDocket.findUniqueOrThrow({ where: { id: input.id }, include: { lines: true } });
      const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: record.purchaseOrderId }, include: { lines: { include: { docketLines: { include: { docket: { select: { id: true, dispatchedAt: true } } } } } } } });
      if (["Draft", "Cancelled"].includes(po.status)) throw new Error("This purchase order cannot be changed.");
      const proposed = checkDocket(po.lines.map(line => ({
        id: line.id, name: line.nameSnapshot, skuCode: line.skuCodeSnapshot,
        qtyOrdered: line.qtyOrdered, qtyConfirmed: line.qtyConfirmed,
        docketed: line.docketLines.filter(entry => entry.docket.id !== input.id).reduce((sum, entry) => sum + entry.qty, 0),
      })), input.lines);
      if (!proposed.ok) throw new Error(proposed.error);
      const dispatchedAt = input.dispatched ? before.dispatchedAt ?? new Date() : null;
      const after = po.lines.map(line => {
        const original = line.docketLines.filter(entry => entry.docket.dispatchedAt).reduce((sum, entry) => sum + entry.qty, 0);
        const other = line.docketLines.filter(entry => entry.docket.id !== input.id && entry.docket.dispatchedAt).reduce((sum, entry) => sum + entry.qty, 0);
        const sent = other + (input.dispatched ? proposed.lines.find(entry => entry.purchaseOrderLineId === line.id)?.qty ?? 0 : 0);
        if (sent < original && sent < line.qtyReceived) throw new Error(`${line.nameSnapshot}: quantities already received cannot be removed from the dispatched total.`);
        return { id: line.id, name: line.nameSnapshot, skuCode: line.skuCodeSnapshot, qtyOrdered: line.qtyOrdered, qtyConfirmed: line.qtyConfirmed, docketed: sent };
      });
      await tx.purchaseOrderDocketLine.deleteMany({ where: { docketId: input.id } });
      const updated = await tx.purchaseOrderDocket.update({ where: { id: input.id }, data: {
        courier: input.courier.trim() || null, trackingNumber: input.trackingNumber.trim() || null,
        note: input.note.trim() || null, dispatchedAt,
        lines: { create: proposed.lines },
      }, include: { lines: true } });
      const first = await tx.purchaseOrderDocket.findFirst({ where: { purchaseOrderId: po.id, dispatchedAt: { not: null } }, orderBy: { dispatchedAt: "asc" } });
      const status = statusAfterDocket(po.status, after);
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status, dispatchedAt: first?.dispatchedAt ?? null } });
      if (status !== po.status) await tx.statusEvent.create({ data: { entity: "PurchaseOrder", entityId: po.id, entityRef: po.poNumber,
        fromStatus: po.status, toStatus: status, actorUserId: actor.id, actorName: actor.name, actorRole: actor.role,
      } });
      const master = actor.role === "Admin" ? await tx.user.findUnique({ where: { id: actor.id }, select: { isMasterAdmin: true } }) : null;
      const actorRole = master?.isMasterAdmin ? "MasterAdmin" : actor.role;
      await tx.auditLog.create({ data: { actorUserId: actor.id, actorName: actor.name, actorRole,
        action: "purchaseOrder.docket.update", entity: "PurchaseOrderDocket", entityId: input.id,
        before: JSON.stringify(before), after: JSON.stringify({ ...updated, reason: input.reason.trim() }),
      } });
      return po.poNumber;
    });
    return { ok: true, value: { poNumber } };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Docket could not be updated." }; }
}
