export function supplierWork(line: {
  qtyOrdered: number; qtyConfirmed: number | null; qtyReviewed?: number | null; qtyReceived: number;
  docketLines: { qty: number; docket: { dispatchedAt: Date | null } }[];
}) {
  const sent = Math.max(line.qtyReceived, line.docketLines.filter(l => l.docket.dispatchedAt).reduce((n, l) => n + l.qty, 0));
  const reserved = Math.max(line.qtyReceived, line.docketLines.reduce((n, l) => n + l.qty, 0));
  const outstanding = Math.max(0, line.qtyOrdered - sent);
  const unprepared = Math.max(0, line.qtyOrdered - reserved);
  const newDemand = line.qtyConfirmed === null ? 0 : Math.max(0, line.qtyOrdered - (line.qtyReviewed ?? line.qtyOrdered));
  const ready = Math.min(unprepared, Math.max(0, (line.qtyConfirmed ?? line.qtyOrdered) - reserved) + newDemand);
  return { sent, outstanding, ready, backordered: unprepared - ready, prepared: outstanding - unprepared };
}
