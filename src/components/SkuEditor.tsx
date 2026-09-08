"use client";

import { useEffect, useRef, useState } from "react";
import { saveSkuAction, saveTiersAction } from "@/app/admin/products/[id]/actions";
import { AdminForm, Checkbox, Field, Panel } from "./AdminForm";

type Tier = {
  minQty: number;
  priceAED: number;
  unitName: string | null;
  unitsPerLevel: number | null;
};

/**
 * One SKU and its price breaks.
 *
 * Two forms, not one. The SKU's own fields and its breaks fail for different
 * reasons — a duplicate item code versus a break that is not cheaper than the
 * one below it — and mixing them means one mistake discards the other's work.
 */
export function SkuEditor({
  productId,
  sku,
  tiers,
  footer,
}: {
  productId: string;
  sku: {
    id: string;
    skuCode: string;
    baseUnitName: string;
    unitLabel: string;
    unitShortLabel: string;
    eachesPerPack: number;
    priceAED: number;
    manualOutOfStock: boolean;
    isActive: boolean;
  };
  tiers: Tier[];
  /** Rendered at the foot of this pack's panel — the Remove control. */
  footer?: React.ReactNode;
}) {
  /**
   * One spare row, so adding a break never needs a separate "add" round trip.
   *
   * KEYED, NOT INDEXED. These inputs are uncontrolled and carry defaultValue,
   * so React only reads that value when a row first mounts. Under an index key
   * removing the middle of three rows leaves the survivors mounted at indexes 0
   * and 1 holding the DOM values they already had — the row that visibly
   * disappears is the last one, whichever one you actually asked to remove.
   * A key that belongs to the row rather than to its position unmounts the
   * right one.
   */
  const nextKey = useRef(0);
  const [rows, setRows] = useState<{ key: number; tier: Tier | null }[]>(() =>
    [...tiers, null].map((tier) => ({ key: nextKey.current++, tier }))
  );
  const savedTiers = useRef(JSON.stringify(tiers));
  useEffect(() => {
    const signature = JSON.stringify(tiers);
    if (signature === savedTiers.current) return;
    savedTiers.current = signature;
    setRows([...tiers, null].map((tier) => ({ key: nextKey.current++, tier })));
  }, [tiers]);

  return (
    <Panel
      title={`SKU ${sku.skuCode}`}
      note={
        sku.isActive
          ? undefined
          : "Retired. It stays in the database because order lines reference it, and it is hidden from the storefront."
      }
    >
      <AdminForm action={saveSkuAction} submitLabel="Save SKU" confirmChange={data => sku.isActive && data.getAll("isActive").at(-1) !== "1" ? `Retire ${sku.skuCode} from the storefront? Existing order history will be retained.` : null}>
        <input type="hidden" name="skuId" value={sku.id} />
        <input type="hidden" name="productId" value={productId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Item code" name="skuCode" defaultValue={sku.skuCode} required />
          <Field
            label="Price (AED)"
            name="priceAED"
            type="number"
            defaultValue={sku.priceAED}
            required
            hint="Excluding VAT. Stored to the fil."
          />
          <Field
            label="Full pack label"
            name="unitLabel"
            defaultValue={sku.unitLabel}
            required
            hint='What the buyer sees, e.g. "100 Pieces/Box".'
          />
          <Field
            label="Short pack name"
            name="unitShortLabel"
            defaultValue={sku.unitShortLabel}
            hint='Beside Add to cart, e.g. "Box".'
          />
          <Field
            label="Base unit name"
            name="baseUnitName"
            defaultValue={sku.baseUnitName}
            hint='One of what, e.g. "Each". Breaks are multiples of this.'
          />
          <Field
            label="Units per pack"
            name="eachesPerPack"
            type="number"
            defaultValue={sku.eachesPerPack}
            hint="Lets a box and a carton be compared per unit."
          />
        </div>

        <div className="mt-4 space-y-2">
          <Checkbox
            label="Out of stock"
            name="manualOutOfStock"
            defaultChecked={sku.manualOutOfStock}
            hint="Buyers see Notify Me instead of Add to cart."
          />
          <Checkbox
            label="Active"
            name="isActive"
            defaultChecked={sku.isActive}
            hint="Unticking retires it from the storefront without touching order history."
          />
        </div>
      </AdminForm>

      <div className="mt-6 border-t border-border-base pt-5">
        <h3 className="text-sm font-bold text-text">Price breaks</h3>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          A break is a packaging level, not an arbitrary discount: 12 exists
          because a carton holds 12, and 48 because a box holds four cartons.
          Each must be cheaper than the one below it. Remove takes a break off
          the table; nothing goes until you save.
        </p>

        <AdminForm action={saveTiersAction} submitLabel="Save price breaks" confirmChange={data => {
          const remaining = new Set(data.getAll("tierMinQty").map(value => Number(value)));
          const removed = tiers.filter(tier => !remaining.has(tier.minQty));
          return removed.length ? `Remove ${removed.length} saved price break${removed.length === 1 ? "" : "s"} from ${sku.skuCode}? Existing orders keep their original prices.` : null;
        }}>
          <input type="hidden" name="skuId" value={sku.id} />
          <input type="hidden" name="productId" value={productId} />

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
                  <th className="pb-1 pr-2">Minimum packs</th>
                  <th className="pb-1 pr-2">AED per pack</th>
                  <th className="pb-1 pr-2">Packaging name</th>
                  <th className="pb-1 pr-2">Packs per level</th>
                  {/* No header text: a column of Remove buttons explains
                      itself, and "Remove" written twice reads as an
                      instruction rather than a heading. */}
                  <th className="pb-1">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ key, tier }) => (
                  <tr key={key}>
                    <td className="py-1 pr-2">
                      <input
                        name="tierMinQty"
                        type="number"
                        min={2}
                        defaultValue={tier?.minQty ?? ""}
                        placeholder="12"
                        className="w-full rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm tnum text-text focus:border-navy focus:outline-none"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        name="tierPrice"
                        type="number"
                        step="0.01"
                        defaultValue={tier?.priceAED ?? ""}
                        placeholder="18.57"
                        className="w-full rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm tnum text-text focus:border-navy focus:outline-none"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        name="tierUnitName"
                        defaultValue={tier?.unitName ?? ""}
                        placeholder="Carton"
                        className="w-full rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm text-text focus:border-navy focus:outline-none"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        name="tierUnitsPerLevel"
                        type="number"
                        min={1}
                        defaultValue={tier?.unitsPerLevel ?? ""}
                        placeholder="12"
                        className="w-full rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm tnum text-text focus:border-navy focus:outline-none"
                      />
                    </td>
                    <td className="py-1 pl-1">
                      {/*
                        Takes the row away rather than blanking it. Clearing the
                        quantity by hand also drops the break — the action
                        rebuilds the whole table from what is posted — but that
                        relies on knowing it, and it leaves three empty boxes
                        sitting where a break used to be, which reads like
                        something half-finished rather than something removed.

                        Nothing is deleted until Save. A break taken off by
                        mistake comes back by reloading the page, which is a
                        cheaper undo than any button here could offer.
                      */}
                      <button
                        type="button"
                        onClick={() =>
                          setRows((r) => {
                            const left = r.filter((row) => row.key !== key);
                            // Never leave the table with no way to add the
                            // first break back.
                            return left.length > 0
                              ? left
                              : [{ key: nextKey.current++, tier: null }];
                          })
                        }
                        aria-label={
                          tier
                            ? `Remove the break at ${tier.minQty}`
                            : "Remove this empty row"
                        }
                        title="Remove this break"
                        className="rounded-card px-2 py-1.5 text-xs font-bold text-text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={() =>
              setRows((r) => [...r, { key: nextKey.current++, tier: null }])
            }
            className="mt-2 text-xs font-bold text-navy hover:underline"
          >
            + Add another break
          </button>
        </AdminForm>
      </div>

      {footer}
    </Panel>
  );
}
