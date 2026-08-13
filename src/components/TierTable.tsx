import { formatAED, savingPercent } from "@/lib/money";
import type { PriceTier } from "@/lib/types";

/**
 * Volume breaks, shown as a table rather than buried in copy. For a trade buyer
 * this is often the most important thing on the page.
 */
export function TierTable({
  basePriceAED,
  tiers,
  unit,
  currentQty,
}: {
  basePriceAED: number;
  tiers: PriceTier[];
  unit: string;
  currentQty?: number;
}) {
  if (tiers.length === 0) return null;

  const activeIndex = currentQty
    ? tiers.reduce(
        (best, tier, i) => (currentQty >= tier.minQty ? i : best),
        -1
      )
    : -1;

  const rows = [
    { minQty: 1, priceAED: basePriceAED, isBase: true },
    ...tiers.map((t) => ({ ...t, isBase: false })),
  ];

  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Volume pricing</caption>
      <thead>
        <tr className="border-b border-border-base text-left text-xs uppercase tracking-wide text-text-subtle">
          <th scope="col" className="py-2 pr-3 font-medium">
            Quantity
          </th>
          <th scope="col" className="py-2 pr-3 font-medium">
            Price per {unit.toLowerCase()}
          </th>
          <th scope="col" className="py-2 text-right font-medium">
            Save
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const active = currentQty !== undefined && i === activeIndex + 1;
          const saving = row.isBase
            ? 0
            : savingPercent(basePriceAED, row.priceAED);
          return (
            <tr
              key={row.minQty}
              className={`border-b border-border-base last:border-0 ${
                active ? "bg-brand-soft" : ""
              }`}
            >
              <td className="py-2 pr-3 tnum">
                {row.isBase && tiers.length > 0
                  ? `1 – ${tiers[0].minQty - 1}`
                  : `${row.minQty}+`}
              </td>
              <td className="py-2 pr-3 font-medium tnum">
                {formatAED(row.priceAED)}
              </td>
              <td className="py-2 text-right tnum">
                {saving > 0 ? (
                  <span className="font-medium text-accent">{saving}%</span>
                ) : (
                  <span className="text-text-subtle">&mdash;</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
