export function clientKey(row: { organisationId?: string | null; userId?: string | null; id: string }): string {
  return row.organisationId ? `organisation:${row.organisationId}` : row.userId ? `user:${row.userId}` : `guest:${row.id}`;
}
export function clientWhere(key: string): { organisationId: string } | { organisationId: null; userId: string } | { organisationId: null; userId: null; id: string } {
  const split = key.indexOf(":"); const kind = key.slice(0, split); const id = key.slice(split + 1);
  if (!id || !["organisation", "user", "guest"].includes(kind)) return { organisationId: null, userId: null, id: "__invalid__" };
  return kind === "organisation" ? { organisationId: id } : kind === "user" ? { organisationId: null, userId: id } : { organisationId: null, userId: null, id };
}

export function clientName(row?: { organisation?: { name: string } | null; user?: { name: string } | null; placedByName?: string | null; shippingSnapshot?: string | null }): string {
  if (!row) return "Client";
  if (row.organisation?.name) return row.organisation.name;
  if (row.user?.name) return row.user.name;
  try {
    const shipping = JSON.parse(row.shippingSnapshot ?? "{}");
    for (const value of [shipping?.company, shipping?.contact]) if (typeof value === "string" && value.trim()) return value.trim();
  } catch { /* Older orders may not have an address snapshot. */ }
  return row.placedByName || "Guest customer";
}
