import "server-only";
import { db } from "./db";
import { requireAdmin, type Result } from "./admin";
import { paymentAmount, paymentBalance, paymentDay } from "./payment-ledger-maths";

export type InvoiceKind = "Order" | "PurchaseOrder";

export async function recordInvoicePayment(input: {
  entity: InvoiceKind; id: string; amount: string; kind: string;
  date: string; note: string; requestKey: string;
}): Promise<Result> {
  if (!["Order", "PurchaseOrder"].includes(input.entity)) return { ok: false, error: "Unknown invoice type." };
  const actor = await requireAdmin(input.entity === "Order" ? "orders" : "purchasing");
  const amount = paymentAmount(input.amount);
  const date = paymentDay(input.date);
  if (!amount) return { ok: false, error: "Enter a positive AED amount with at most two decimal places." };
  if (!date || date > new Date()) return { ok: false, error: "Enter the payment date, no later than today." };
  if (!["Payment", "Refund"].includes(input.kind)) return { ok: false, error: "Choose payment or refund." };
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(input.requestKey)) return { ok: false, error: "Reload the payment form and try again." };
  if (input.note.length > 2000) return { ok: false, error: "Keep the note under 2,000 characters." };
  const amountFils = input.kind === "Refund" ? -amount : amount;
  try {
    await db.$transaction(async (tx) => {
      const link = input.entity === "Order" ? { orderId: input.id } : { purchaseOrderId: input.id };
      const existing = await tx.invoicePayment.findUnique({ where: { requestKey: input.requestKey } });
      if (existing) {
        if (existing.actorUserId === actor.id && existing.amountFils === amountFils &&
            existing.occurredAt?.getTime() === date.getTime() &&
            (input.entity === "Order" ? existing.orderId : existing.purchaseOrderId) === input.id) return;
        throw new Error("That submission was already used. Reload before recording another payment.");
      }
      const invoice = input.entity === "Order"
        ? await tx.order.findUnique({ where: { id: input.id } })
        : await tx.purchaseOrder.findUnique({ where: { id: input.id } });
      if (!invoice) throw new Error("That invoice no longer exists.");
      const total = "totalFils" in invoice ? invoice.totalFils : invoice.totalCostFils;
      const next = paymentBalance(invoice.paidFils, amountFils, total);
      const master = await tx.user.findUnique({ where: { id: actor.id }, select: { isMasterAdmin: true } });
      const actorRole = master?.isMasterAdmin ? "MasterAdmin" : "Admin";
      const entry = await tx.invoicePayment.create({ data: {
        ...link, amountFils, kind: input.kind, occurredAt: date, note: input.note.trim() || null,
        actorUserId: actor.id, actorName: actor.name, actorRole, requestKey: input.requestKey,
      } });
      const data = { ...next, paidAt: next.paymentStatus === "Paid" ? date : null };
      if (input.entity === "Order") await tx.order.update({ where: { id: input.id }, data });
      else await tx.purchaseOrder.update({ where: { id: input.id }, data });
      await tx.auditLog.create({ data: {
        actorUserId: actor.id, actorName: actor.name, actorRole, action: "invoice.payment.record",
        entity: input.entity, entityId: input.id,
        before: JSON.stringify({ paidFils: invoice.paidFils, paymentStatus: invoice.paymentStatus }),
        after: JSON.stringify({ ...data, entry }),
      } });
    });
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The payment could not be recorded." };
  }
}

/** Legacy balance controls still produce an immutable adjustment entry. */
export async function adjustInvoiceBalance(input: {
  entity: InvoiceKind; identifier: string; paidFils: number | null;
  paymentStatus: string; dueOn: string | null;
}): Promise<Result> {
  const actor = await requireAdmin(input.entity === "Order" ? "orders" : "purchasing");
  if (!["Unpaid", "PartiallyPaid", "Paid", "Overdue", "Refunded"].includes(input.paymentStatus)) return { ok: false, error: "Unknown payment status." };
  if (input.paidFils !== null && (!Number.isSafeInteger(input.paidFils) || input.paidFils < 0)) return { ok: false, error: "Enter a valid paid-so-far amount." };
  const due = input.dueOn ? paymentDay(input.dueOn) : null;
  if (input.dueOn && !due) return { ok: false, error: "Enter a valid due date." };
  try {
    await db.$transaction(async (tx) => {
      const invoice = input.entity === "Order"
        ? await tx.order.findUnique({ where: { reference: input.identifier } })
        : await tx.purchaseOrder.findUnique({ where: { id: input.identifier } });
      if (!invoice) throw new Error("That invoice no longer exists.");
      const total = "totalFils" in invoice ? invoice.totalFils : invoice.totalCostFils;
      if (input.paymentStatus === "Paid" && total === null) throw new Error("Record all supplier costs before marking the invoice paid.");
      const paid = input.paymentStatus === "Paid" ? total! : input.paidFils ?? invoice.paidFils;
      const next = paymentBalance(invoice.paidFils, paid - invoice.paidFils, total);
      if (input.paymentStatus === "PartiallyPaid" && (paid === 0 || paid === total)) throw new Error("A part payment must be greater than zero and less than the invoice total.");
      if (["Unpaid", "Refunded"].includes(input.paymentStatus) && paid !== 0) throw new Error("Set paid so far to zero for an unpaid or fully refunded invoice.");
      const now = new Date();
      const data = {
        ...next, paymentStatus: input.paymentStatus === "Refunded" ? "Refunded" : next.paymentStatus,
        paymentDueOn: input.dueOn === null ? invoice.paymentDueOn : due,
        paidAt: next.paymentStatus === "Paid" ? invoice.paidAt ?? now : null,
      };
      const master = await tx.user.findUnique({ where: { id: actor.id }, select: { isMasterAdmin: true } });
      const actorRole = master?.isMasterAdmin ? "MasterAdmin" : "Admin";
      if (paid !== invoice.paidFils) await tx.invoicePayment.create({ data: {
        ...(input.entity === "Order" ? { orderId: invoice.id } : { purchaseOrderId: invoice.id }),
        amountFils: paid - invoice.paidFils, kind: "Adjustment", occurredAt: now,
        actorUserId: actor.id, actorName: actor.name, actorRole,
        note: "Paid-so-far balance corrected using invoice controls.",
      } });
      if (input.entity === "Order") await tx.order.update({ where: { id: invoice.id }, data });
      else await tx.purchaseOrder.update({ where: { id: invoice.id }, data });
      await tx.auditLog.create({ data: {
        actorUserId: actor.id, actorName: actor.name, actorRole,
        action: "invoice.payment.adjust", entity: input.entity, entityId: invoice.id,
        before: JSON.stringify({ paidFils: invoice.paidFils, paymentStatus: invoice.paymentStatus, paymentDueOn: invoice.paymentDueOn }),
        after: JSON.stringify(data),
      } });
    });
    return { ok: true, value: undefined };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Payment could not be updated." }; }
}
