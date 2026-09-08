import { formatAED } from "@/lib/money";
import { MarginFigures, MarginPill } from "./MarginPanel";
import type { SkuMargin } from "@/lib/margin-data";

const aed = (fils: number) => formatAED(fils / 100);

/**
 * What each pack of this product makes — admin only.
 *
 * EVERY SUPPLIER ON THE PACK IS LISTED, not only the three in the cover slots.
 * The fallbacks matter because they are what gets bought from when the primary
 * cannot supply, and if their cost is much worse then the headline figure is
 * the margin on a good day rather than an ordinary one. The companies in no
 * slot at all matter for the opposite reason: one of them undercutting our
 * primary is the single most useful thing this table can show, and it is
 * invisible on a report that lists only who we already buy from.
 *
 * The distinction is never blurred. An offer is labelled as one, and the
 * headline percentage is always against a supplier we can actually order from
 * — named underneath, so a percentage is never ambiguous.
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
        Never shown to customers or to suppliers. Every company carrying each
        pack is listed — the three we buy from, and anyone else who has added
        it to their own list, so their prices can be compared.
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
                        key={(supply.rank ?? "offer") + supply.supplierName}
                        className="border-b border-border-base last:border-0"
                      >
                        <td className="py-1.5 pr-3 font-semibold text-text-muted">
                          {supply.isCover ? (
                            supply.rankLabel
                          ) : (
                            /* Not in one of the three slots, so nothing is
                               bought here. Labelled rather than left blank —
                               the row is on the table precisely because the
                               comparison is the point. */
                            <span
                              className="text-text-subtle"
                              title="Carries this item but is not one of the three suppliers, so nothing is ordered from them"
                            >
                              offer
                            </span>
                          )}
                        </td>
                        <td
                          className={`py-1.5 pr-3 ${
                            supply.isCover ? "text-text" : "text-text-muted"
                          }`}
                        >
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
                          {/* A price asked for and not agreed. Worth seeing
                              next to the cost it would replace, and never
                              counted into a margin until somebody says yes. */}
                          {supply.proposedCostFils !== null && (
                            <span
                              className="ml-1.5 whitespace-nowrap text-xs font-bold text-accent"
                              title="Requested by the supplier and not yet agreed"
                            >
                              &rarr; {aed(supply.proposedCostFils)} asked
                            </span>
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
