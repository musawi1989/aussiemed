/**
 * One pill for every status in the admin area, so the same word never means
 * two different things in two places.
 *
 * The tone carries meaning: green is fine, amber wants a person, red is
 * stopped, grey is deliberately out of the way.
 */
const TONE: Record<string, string> = {
  // Products
  Active: "bg-success-soft text-success",
  PendingApproval: "bg-accent-soft text-accent",
  Draft: "bg-surface-sunken text-text-muted",
  Inactive: "bg-surface-sunken text-text-muted",

  // Suppliers and users
  Suspended: "bg-danger-soft text-danger",
  Disabled: "bg-danger-soft text-danger",

  // Orders and invoices
  Pending: "bg-accent-soft text-accent",
  Processing: "bg-navy-soft text-navy",
  Dispatched: "bg-navy-soft text-navy",
  Delivered: "bg-success-soft text-success",
  Cancelled: "bg-danger-soft text-danger",
  Issued: "bg-navy-soft text-navy",
  Paid: "bg-success-soft text-success",
};

/** "PendingApproval" reads as two words to everyone except a database. */
function label(status: string): string {
  return status.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${
        TONE[status] ?? "bg-surface-sunken text-text-muted"
      }`}
    >
      {label(status)}
    </span>
  );
}
