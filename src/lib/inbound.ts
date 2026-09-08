import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { requireAdmin, audit, type Result } from "./admin";
import { recordStatus } from "./status-events";

class InboundConflict extends Error {}
type ReceiptLine = { lineId: string; qtyReceived: number; batchCode: string | null; expiresOn: Date | null };
type ReceiptResult = { linesReceived: number; unitsReceived: number; shortfall: number; status: string };
const fail = (error: string): Result<never> => ({ ok: false, error });

export async function bookGoodsReceipt(id: string, lines: ReceiptLine[], requestKey: string = randomUUID()): Promise<Result<ReceiptResult>> {
  const actor = await requireAdmin("purchasing");
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestKey)) return fail("Invalid receipt request.");
  if (!lines.length || new Set(lines.map(line => line.lineId)).size !== lines.length) return fail("Choose each receipt line once.");
  if (lines.some(line => !Number.isSafeInteger(line.qtyReceived) || line.qtyReceived < 0)) return fail("Received quantities must be whole numbers, zero or more.");
  if (!lines.some(line => line.qtyReceived > 0)) return fail("Enter at least one received quantity.");
  if (lines.some(line => line.expiresOn && Number.isNaN(line.expiresOn.getTime()))) return fail("Enter a valid expiry date.");
  try {
    const result = await db.$transaction(async tx => {
      const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
      if (!po || ["Draft", "Cancelled"].includes(po.status)) throw new InboundConflict("This purchase order cannot receive goods.");
      const keys = lines.filter(line => line.qtyReceived > 0).map(line => requestKey + "-" + line.lineId);
      const repeats = await tx.goodsReceipt.findMany({ where: { requestKey: { in: keys } } });
      if (repeats.length) {
        if (repeats.length !== keys.length || repeats.some(r => !lines.some(l => l.lineId === r.purchaseOrderLineId && l.qtyReceived === r.qty))) throw new InboundConflict("This receipt request was already used with different quantities.");
        return { po, outcome: { linesReceived: repeats.length, unitsReceived: repeats.reduce((n, r) => n + r.qty, 0), shortfall: 0, status: po.status }, repeated: true };
      }
      for (const line of lines) {
        const existing = po.lines.find(l => l.id === line.lineId);
        if (!existing || line.qtyReceived > existing.qtyOrdered - existing.qtyReceived) throw new InboundConflict("A received quantity exceeds what is still outstanding. Refresh and check the delivery.");
        if (!line.qtyReceived) continue;
        await tx.goodsReceipt.create({ data: {
          purchaseOrderLineId: line.lineId, qty: line.qtyReceived, batchCode: line.batchCode?.trim() || null,
          expiresOn: line.expiresOn, requestKey: requestKey + "-" + line.lineId, receivedBy: actor.id,
        } });
        await tx.purchaseOrderLine.update({ where: { id: line.lineId }, data: { qtyReceived: { increment: line.qtyReceived } } });
      }
      const after = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } });
      const complete = after.every(line => line.qtyReceived >= line.qtyOrdered);
      const status = complete ? "Received" : "PartiallyReceived";
      await tx.purchaseOrder.update({ where: { id }, data: { status, receivedAt: complete ? new Date() : null } });
      return { po, outcome: { linesReceived: keys.length, unitsReceived: lines.reduce((n, line) => n + line.qtyReceived, 0), shortfall: after.reduce((n, line) => n + Math.max(0, line.qtyOrdered - line.qtyReceived), 0), status }, repeated: false };
    });
    if (!result.repeated) {
      await audit(actor, "purchaseOrder.receive", "PurchaseOrder", result.po.poNumber, { status: result.po.status }, { ...result.outcome, requestKey });
      await recordStatus({ entity: "PurchaseOrder", entityId: id, entityRef: result.po.poNumber, fromStatus: result.po.status, toStatus: result.outcome.status, actor: { id: actor.id, name: actor.name, role: "Admin" } });
    }
    return { ok: true, value: result.outcome };
  } catch (error) { if (error instanceof InboundConflict) return fail(error.message); throw error; }
}

export async function inboundProducts() {
  await requireAdmin("orders", "view");
  const receipts = await db.goodsReceipt.findMany({
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    include: {
      allocations: { select: { qty: true } },
      purchaseOrderLine: { include: {
        purchaseOrder: { select: { poNumber: true, supplier: { select: { id: true, companyName: true } } } },
        allocations: { include: { orderItem: { include: {
          order: { select: { id: true, organisationId: true, userId: true, shippingSnapshot: true, placedByName: true, reference: true, status: true, placedAt: true, user: { select: { name: true } }, organisation: { select: { name: true } } } },
          goodsAllocations: { select: { qty: true, receipt: { select: { purchaseOrderLineId: true } } } },
          shipmentLines: { select: { qty: true, shipment: { select: { dispatchedAt: true } } } },
        } } } },
      } },
    },
  });
  return receipts.map(receipt => ({
    ...receipt,
    remaining: Math.max(0, receipt.qty - receipt.allocations.reduce((n, a) => n + a.qty, 0)),
  })).filter(receipt => receipt.remaining > 0);
}

export async function allocateReceivedGoods(input: { receiptId: string; orderItemId: string; qty: number; requestKey: string }): Promise<Result> {
  const actor = await requireAdmin("orders");
  if (!Number.isSafeInteger(input.qty) || input.qty < 1 || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestKey)) return fail("Choose a valid whole quantity.");
  try {
    const result = await db.$transaction(async tx => {
      const previous = await tx.goodsAllocation.findUnique({ where: { requestKey: input.requestKey } });
      if (previous) {
        if (previous.receiptId !== input.receiptId || previous.orderItemId !== input.orderItemId || previous.qty !== input.qty) throw new InboundConflict("This allocation request was already used.");
        return { repeated: true, previous: 0, statusChange: null };
      }
      const receipt = await tx.goodsReceipt.findUnique({ where: { id: input.receiptId }, include: { allocations: true, purchaseOrderLine: { select: { skuId: true } } } });
      const item = await tx.orderItem.findUnique({ where: { id: input.orderItemId }, include: { order: true, goodsAllocations: true, shipmentLines: { include: { shipment: true } } } });
      if (!receipt || !item || item.skuId !== receipt.purchaseOrderLine.skuId) throw new InboundConflict("The received product does not match that order line.");
      if (["Cancelled", "Delivered"].includes(item.order.status) || ["Cancelled", "Shipped"].includes(item.status)) throw new InboundConflict("That customer order line is closed.");
      const reserved = await tx.purchaseAllocation.aggregate({ where: { purchaseOrderLineId: receipt.purchaseOrderLineId, orderItemId: item.id }, _sum: { qty: true } });
      if (!reserved._sum.qty) throw new InboundConflict("That order is not assigned to this supplier's purchase line.");
      const already = item.goodsAllocations.reduce((n, a) => n + a.qty, 0);
      const sent = item.shipmentLines.filter(l => l.shipment.dispatchedAt).reduce((n, l) => n + l.qty, 0);
      const sameLine = await tx.goodsAllocation.aggregate({ where: { orderItemId: item.id, receipt: { purchaseOrderLineId: receipt.purchaseOrderLineId } }, _sum: { qty: true } });
      const free = receipt.qty - receipt.allocations.reduce((n, a) => n + a.qty, 0);
      const needed = Math.min(item.qty - Math.max(already, sent), reserved._sum.qty - (sameLine._sum.qty ?? 0));
      if (input.qty > free || input.qty > needed) throw new InboundConflict("The available or required quantity changed. Refresh before allocating.");
      await tx.goodsAllocation.create({ data: { ...input, allocatedBy: actor.id } });
      const allocateStatus = already + input.qty >= item.qty && !["Allocated", "Picked", "Packed"].includes(item.status);
      await tx.orderItem.update({ where: { id: item.id }, data: {
        ...(allocateStatus ? { status: "Allocated" } : {}),
        batchCodeSnapshot: item.batchCodeSnapshot ?? receipt.batchCode,
        expiresOnSnapshot: item.expiresOnSnapshot ?? receipt.expiresOn,
      } });
      return { repeated: false, previous: already, statusChange: allocateStatus ? { from: item.status, reference: item.order.reference } : null };
    });
    if (!result.repeated) await audit(actor, "goods.allocate", "OrderItem", input.orderItemId, { allocated: result.previous }, { ...input, allocated: result.previous + input.qty });
    if (result.statusChange) await recordStatus({ entity: "OrderItem", entityId: input.orderItemId, entityRef: result.statusChange.reference, fromStatus: result.statusChange.from, toStatus: "Allocated", actor: { id: actor.id, name: actor.name, role: "Admin" } });
    return { ok: true, value: undefined };
  } catch (error) { if (error instanceof InboundConflict) return fail(error.message); throw error; }
}
