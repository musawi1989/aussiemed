/**
 * The numbers a trade customer wants about their own account.
 *
 * Pure, so the arithmetic is testable without a database — the same split used
 * throughout. account.ts supplies the dates and amounts.
 */

export type OrderSummary = { placedAt: number; totalFils: number };

export type AccountMetrics = {
  orderCount: number;
  totalSpentFils: number;
  averageOrderFils: number;
  /**
   * Median days between consecutive orders. Median rather than mean because
   * one long holiday shutdown would drag an average out of all recognition.
   * Null until there are enough orders to see a pattern — three, so there are
   * at least two gaps to compare.
   */
  cadenceDays: number | null;
  lastOrderAt: number | null;
  daysSinceLastOrder: number | null;
  /**
   * True when they are noticeably overdue against their own rhythm. Half as
   * long again as their usual gap: late enough to mean something, not so
   * eager that it fires on a normal week.
   */
  overdue: boolean;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

const DAY = 86_400_000;

export function accountMetrics(
  orders: OrderSummary[],
  now: number
): AccountMetrics {
  if (orders.length === 0) {
    return {
      orderCount: 0,
      totalSpentFils: 0,
      averageOrderFils: 0,
      cadenceDays: null,
      lastOrderAt: null,
      daysSinceLastOrder: null,
      overdue: false,
    };
  }

  const byDate = [...orders].sort((a, b) => a.placedAt - b.placedAt);
  const totalSpentFils = byDate.reduce((n, o) => n + o.totalFils, 0);
  const lastOrderAt = byDate[byDate.length - 1].placedAt;

  const gaps: number[] = [];
  for (let i = 1; i < byDate.length; i++) {
    gaps.push(Math.round((byDate[i].placedAt - byDate[i - 1].placedAt) / DAY));
  }

  const cadenceDays = byDate.length >= 3 ? median(gaps) : null;
  const daysSinceLastOrder = Math.floor((now - lastOrderAt) / DAY);

  return {
    orderCount: byDate.length,
    totalSpentFils,
    averageOrderFils: Math.round(totalSpentFils / byDate.length),
    cadenceDays,
    lastOrderAt,
    daysSinceLastOrder,
    overdue:
      cadenceDays !== null && cadenceDays > 0
        ? daysSinceLastOrder > cadenceDays * 1.5
        : false,
  };
}
