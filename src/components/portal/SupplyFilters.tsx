/**
 * Finding one line among everything a supplier carries.
 *
 * The list was 31 items with no way through it but scrolling, on the screen a
 * supplier opens most — to change a price, or to say they have run out. At a
 * couple of hundred lines that stops being a list and becomes a haystack.
 *
 * A plain GET form, like the purchase-order filters, so the portal behaves the
 * same way twice: it works without JavaScript and the result is a URL.
 *
 * The two named views are the two reasons a supplier goes looking — something
 * they cannot currently supply, and something we hold no price for. Both are
 * counted on the page already, so the filter is the missing half of a number
 * that was otherwise only decorative.
 */
export function SupplyFilters({
  current,
  counts,
}: {
  current: { q?: string; show?: string };
  counts: { unavailable: number; noPrice: number };
}) {
  const field =
    "h-9 w-full rounded-card border border-border-strong bg-surface px-2.5 text-sm text-text focus:border-navy focus:outline-none";

  return (
    <form
      method="get"
      className="mt-4 grid gap-2 rounded-card border border-border-base bg-surface p-3 shadow-card sm:grid-cols-[2fr_1.2fr_auto]"
    >
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
          Product or item code
        </span>
        <input
          type="search"
          name="q"
          defaultValue={current.q ?? ""}
          placeholder="nitrile gloves, or GLVNRLPFL"
          className={field}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
          Show
        </span>
        <select name="show" defaultValue={current.show ?? "all"} className={field}>
          <option value="all">Everything</option>
          <option value="unavailable">
            Cannot supply ({counts.unavailable})
          </option>
          <option value="noprice">No price set ({counts.noPrice})</option>
        </select>
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
