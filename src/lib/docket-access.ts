import "server-only";
import { getSessionUser } from "./auth";
import { requireAdmin } from "./admin";
import { db } from "./db";
import { ensure } from "./permissions";

export async function requireDocketActor(purchaseOrderId: string) {
  const user = await getSessionUser();
  if (user?.role === "Admin") return requireAdmin("purchasing");
  if (!user || user.role !== "Supplier" || !user.supplierId) throw new Error("Supplier access required.");
  const po = await db.purchaseOrder.findFirst({ where: { id: purchaseOrderId, supplierId: user.supplierId, status: { not: "Draft" }, supplier: { status: "Active" } }, select: { id: true } });
  if (!po) throw new Error("This purchase order is not available to your supplier account.");
  const allowed = await ensure("markDispatched");
  if (!allowed.ok) throw new Error(allowed.error);
  return user;
}
