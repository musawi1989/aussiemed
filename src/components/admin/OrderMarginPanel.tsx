import { formatAED } from "@/lib/money";
import { marginOf } from "@/lib/margin";
import { MarginPill } from "./MarginPanel";
import type { OrderMargin } from "@/lib/margin-data";

const aed = (fils: number) => formatAED(fils / 100);

/**
 * What this order actually made — admin only.
 *
 * The figures come from the purchase order lines the units were allocated
 * from, not from the catalogue: what a product is listed as costing and what
 * this order cost can differ, and only the second is real. That is also why
 * the panel is often incomplete — under cross-dock nothing is bought until the
 * cutoff, so a fresh order has no cost at all yet, and that is the honest
 * answer rather than a gap to fill with the list price.
 */
export function OrderMarginPanel({ margin }: { margin: OrderMargin | null }) {
  if (!margin || margin.lines.length === 0) return null;

  const { total, lines } = margin;
  const waiting = lines.filter((line) => !line.complete).length;

  return (
    <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold tracking-tight text-text">
          What this order made
        </h2>
        <span className="rounded-full bg-navy-soft px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-navy">
          Staff only
        </span>
      </div>

      {total.linesCosted === 0 ? (
        <p className="mt-3 rounded-card border-l-4 border-accent-border bg-accent-soft px-3 py-2 text-sm text-text">
          Nothing on this order has been bought yet, so there is no cost to
          measure against. Margin appears once the purchase orders it is
          fulfilled from have been received.
        </p>
      ) : (
        <>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
            <Figure label="Sold for" value={aed(total.sellFils)} />
            <Figure label="Cost us" value={aed(total.costFils ?? 0)} />
            <Figure
              label="Margin"
              value={`${aed(total.marginFils ?? 0)} (${total.marginPercent}%)`}
              danger={total.losing}
            />
          </dl>

          {/* Said out loud rather than left to be inferred from a total that
              is quietly smaller than the order. */}
          {total.linesUnknown > 0 && (
            <p className="mt-3 rounded-card border-l-4 border-accent-border bg-accent-soft px-3 py-2 text-sm text-text tnum">
              Covers {total.linesCosted} of {lines.length} lines.{" "}
              {total.linesUnknown}{" "}
              {total.linesUnknown === 1 ? "line has" : "lines have"} not been
              fully bought yet and {total.linesUnknown === 1 ? "is" : "are"} not
              counted above.
            </p>
          )}
        </>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-base text-left text-xs uppercase tracking-wide text-text-subtle">
              <th scope="col" className="py-1.5 pr-3 font-bold">Line</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">Sold</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">Cost</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">Margin</th>
              <th scope="col" className="py-1.5 text-right font-bold">%</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr
                key={line.orderItemId}
                className="border-b border-border-base last:border-0"
              >
                <td className="py-1.5 pr-3">
                  <span className="block text-text">{line.name}</span>
                  <span className="block text-xs text-text-subtle tnum">
                    {line.skuCode} &middot; {line.qty} ordered
                    {!line.complete && line.qtyOutstanding > 0
                      ? ` · ${line.qtyOutstanding} not yet bought`
                      : ""}
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-right tnum text-text">
                  {aed(line.lineTotalFils)}
                </td>
                <td className="py-1.5 pr-3 text-right tnum text-text-muted">
                  {line.costFils === null ? "—" : aed(line.costFils)}
                </td>
                <td
                  className={`py-1.5 pr-3 text-right font-bold tnum ${
                    line.losing ? "text-danger" : "text-text"
                  }`}
                >
                  {line.marginFils === null ? "—" : aed(line.marginFils)}
                </td>
                <td className="py-1.5 text-right">
                  <MarginPill
                    margin={marginOf(line.lineTotalFils, line.costFils)}
                    incomplete={!line.complete}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {waiting > 0 && (
        <p className="mt-3 text-xs text-text-subtle">
          Lines marked &ldquo;part bought&rdquo; show no margin on purpose. A
          line three-fifths delivered would otherwise report a figure far better
          than the real one.
        </p>
      )}
    </section>
  );
}

function Figure({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </dt>
      <dd
        className={`text-lg font-bold tnum ${danger ? "text-danger" : "text-text"}`}
      >
        {value}
      </dd>
    </div>
  );
}
