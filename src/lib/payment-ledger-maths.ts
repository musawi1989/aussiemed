export function paymentAmount(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function paymentDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const utc = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== value) return null;
  return new Date(utc.getTime() - 4 * 60 * 60 * 1000);
}

export function paymentBalance(paidFils: number, delta: number, totalFils: number | null) {
  const balance = paidFils + delta;
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error("A refund cannot exceed the amount paid.");
  if (totalFils !== null && balance > totalFils) throw new Error("The payment exceeds the remaining invoice balance.");
  return {
    paidFils: balance,
    paymentStatus: balance === 0 ? (delta < 0 ? "Refunded" : "Unpaid")
      : totalFils !== null && balance === totalFils ? "Paid" : "PartiallyPaid",
  };
}
