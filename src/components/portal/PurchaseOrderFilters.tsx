/**
 * Finding one purchase order among a year of them.
 *
 * A plain GET form, server-rendered. It works without JavaScript, the result
 * is a URL a supplier can bookmark or send to their own accounts department,
 * and the back button behaves. A filter bar that holds its state in the
 * browser gives up all three for an animation nobody asked for.
 *
 * Everything is optional and nothing is remembered between visits: a supplier
 * arriving to check today's orders should see today's orders, not last
 * March's search.
 */
export function PurchaseOrderFilters({
  statuses,
  current,
}: {
  statuses: readonly string[];
  current: { q?: string; status?: string; from?: string; to?: string };
}) {
  const field =
    "h-9 w-full rounded-card border border-border-strong bg-surface px-2.5 text-sm text-text focus:border-navy focus:outline-none";

  return (
    <form
      method="get"
      className="mt-3 grid gap-2 rounded-card border border-border-base bg-surface p-3 shadow-card sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]"
    >
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
          Order or tracking number
        </span>
        <input
          type="search"
          name="q"
          defaultValue={current.q ?? ""}
          placeholder="PO-2026-000006"
          className={field}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
          Status
        </span>
        <select name="status" defaultValue={current.status ?? "all"} className={field}>
          <option value="all">Any status</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {/* PartiallyReceived is one word in the database and two on a
                  screen a person reads. */}
              {status.replace(/([a-z])([A-Z])/g, "$1 $2")}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
          Ordered from
        </span>
        <input type="date" name="from" defaultValue={current.from ?? ""} className={field} />
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
          Ordered to
        </span>
        <input type="date" name="to" defaultValue={current.to ?? ""} className={field} />
      </label>

      <div className="flex items-end">
        <button
          type="submit"
          className="h-9 w-full rounded-card bg-navy px-4 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover sm:w-auto"
        >
          Filter
        </button>
      </div>
    </form>
  );
}
