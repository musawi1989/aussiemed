"use client";

import { displayPrice, formatAED, unitPriceFor } from "@/lib/money";
import { useStore } from "@/lib/store";
import type { Pack, TaxClass } from "@/lib/types";

/**
 * Volume breaks as a compact two-column table, shown on the product card as
 * well as the detail page.
 *
 * Trade buyers compare break *structures* while scanning a list — a single
 * "save 4%" badge hides the information they are actually shopping on. The
 * "+10" notation reads as "ten or more".
 */
export function PriceBreaks({
  pack,
  taxClass,
  currentQty,
  compact = false,
}: {
  pack: Pack;
  taxClass: TaxClass;
  currentQty?: number;
  compact?: boolean;
}) {
  const { includeVat } = useStore();

  const rows = [
    { minQty: 1, priceAED: pack.priceAED },
    ...pack.tiers,
  ];

  const activeIndex =
    currentQty === undefined
      ? -1
      : rows.reduce((best, row, i) => (currentQty >= row.minQty ? i : best), 0);

  const pad = compact ? "py-1" : "py-1.5";

  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">Volume pricing</caption>
      <thead>
        <tr className="border-b border-border-base">
          <th
            scope="col"
            className={`${pad} pr-2 text-[11px] font-semibold uppercase tracking-wide text-text-subtle`}
          >
            Quantity
          </th>
          <th
            scope="col"
            className={`${pad} text-right text-[11px] font-semibold uppercase tracking-wide text-text-subtle`}
          >
            Price ({includeVat ? "Inc." : "Ex."} VAT)
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const net = unitPriceFor(pack.priceAED, pack.tiers, row.minQty);
          const shown = displayPrice(net, taxClass, includeVat);
          const active = i === activeIndex;
          return (
            <tr
              key={row.minQty}
              className={`border-b border-border-base last:border-0 ${
                active ? "bg-navy-soft" : ""
              }`}
            >
              <td className={`${pad} pr-2 text-sm tnum text-text-muted`}>
                +{row.minQty}
              </td>
              <td
                className={`${pad} text-right text-sm font-bold tnum ${
                  active ? "text-navy" : "text-text"
                }`}
              >
                {formatAED(shown)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The "Inc. VAT"/"Ex. VAT" qualifier, with zero-rated stated explicitly. */
export function VatNote({ taxClass }: { taxClass: TaxClass }) {
  const { includeVat } = useStore();
  if (taxClass === "zero-rated") {
    return <span className="text-xs text-success">VAT free</span>;
  }
  return (
    <span className="text-xs text-text-subtle">
      {includeVat ? "Inc. 5% VAT" : "Ex. VAT"}
    </span>
  );
}
