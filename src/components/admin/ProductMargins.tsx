import { formatAED } from "@/lib/money";
import { MarginFigures, MarginPill } from "./MarginPanel";
import type { SkuMargin } from "@/lib/margin-data";

const aed = (fils: number) => formatAED(fils / 100);

/**
 * What each pack of this product makes — admin only.
 *
 * Both suppliers are listed, because the second one is not decoration: it is
 * what gets bought from when the first cannot supply, and if its cost is much
 * worse then the margin shown is the margin on a good day rather than on an
 * ordinary one. Which supplier the headline figure is against is always named,
 * so a percentage is never ambiguous about what it is a percentage of.
 */
export function ProductMargins({ margins }: { margins: SkuMargin[] }) {
  const anyCost = margins.some((m) => m.margin.costFils !== null);

  return (
    <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold tracking-tight text-text">
          Cost and margin
        </h2>
        <span className="rounded-full bg-navy-soft px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-navy">
          Staff only
        </span>
      </div>

      <p className="mt-1 text-sm text-text-muted">
        Never shown to customers or to suppliers. Costs come from the two
        suppliers set up against each pack.
      </p>

      {!anyCost && (
        <p className="mt-3 rounded-card border-l-4 border-accent-border bg-accent-soft px-3 py-2 text-sm text-text">
          No cost has been recorded for this product yet, so there is no margin
          to show. Costs load with the catalogue upload, or can be set against a
          supplier by hand.
        </p>
      )}

      <ul className="mt-4 space-y-4">
        {margins.map((sku) => (
          <li
            key={sku.skuId}
            className={`rounded-card border p-4 ${
              sku.isActive
                ? "border-border-base bg-surface-sunken"
                : "border-dashed border-border-strong bg-surface"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold tnum text-text">
                  {sku.skuCode}
                  {!sku.isActive && (
                    <span className="ml-2 text-xs font-bold uppercase text-text-subtle">
                      inactive
                    </span>
                  )}
                </p>
                <p className="text-xs text-text-muted">{sku.unitLabel}</p>
              </div>
              <MarginPill margin={sku.margin} />
            </div>

            <div className="mt-3">
              <MarginFigures margin={sku.margin} />
            </div>

            {sku.basis && (
              <p className="mt-2 text-xs text-text-subtle">
                Against the {sku.basis}
              </p>
            )}

            {sku.supplies.length > 0 ? (
              <table className="mt-3 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-base text-left text-xs uppercase tracking-wide text-text-subtle">
                    <th scope="col" className="py-1.5 pr-3 font-bold">Rank</th>
                    <th scope="col" className="py-1.5 pr-3 font-bold">Supplier</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-bold">Cost</th>
                    <th scope="col" className="py-1.5 text-right font-bold">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {sku.supplies.map((supply) => {
                    const marginFils =
                      supply.costFils === null ? null : sku.sellFils - supply.costFils;
                    return (
                      <tr
                        key={supply.rank + supply.supplierName}
                        className="border-b border-border-base last:border-0"
                      >
                        <td className="py-1.5 pr-3 font-semibold text-text-muted">
                          {supply.rank}
                        </td>
                        <td className="py-1.5 pr-3 text-text">
                          {supply.supplierName}
                          {!supply.isAvailable && (
                            <span className="ml-1.5 text-xs font-bold text-danger">
                              unavailable
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 text-right tnum text-text">
                          {supply.costFils === null ? (
                            <span className="text-text-subtle">not recorded</span>
                          ) : (
                            aed(supply.costFils)
                          )}
                        </td>
                        <td
                          className={`py-1.5 text-right font-bold tnum ${
                            marginFils === null
                              ? "text-text-subtle"
                              : marginFils < 0
                                ? "text-danger"
                                : "text-text"
                          }`}
                        >
                          {marginFils === null ? "—" : aed(marginFils)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="mt-3 text-sm text-text-subtle">
                No supplier set up for this pack, so it cannot be bought at all.
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
