"use client";

import { useState } from "react";
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
}) {
  // One spare row, so adding a break never needs a separate "add" round trip.
  const [rows, setRows] = useState<(Tier | null)[]>([...tiers, null]);

  return (
    <Panel
      title={`SKU ${sku.skuCode}`}
      note={
        sku.isActive
          ? undefined
          : "Retired. It stays in the database because order lines reference it, and it is hidden from the storefront."
      }
    >
      <AdminForm action={saveSkuAction} submitLabel="Save SKU">
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
            label="Unit label"
            name="unitLabel"
            defaultValue={sku.unitLabel}
            required
            hint='What the buyer sees, e.g. "100 Pieces/Box".'
          />
          <Field
            label="Short label"
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
          Each must be cheaper than the one below it. Clear a quantity to remove
          that row.
        </p>

        <AdminForm action={saveTiersAction} submitLabel="Save price breaks">
          <input type="hidden" name="skuId" value={sku.id} />
          <input type="hidden" name="productId" value={productId} />

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
                  <th className="pb-1 pr-2">From qty</th>
                  <th className="pb-1 pr-2">Price (AED)</th>
                  <th className="pb-1 pr-2">Level name</th>
                  <th className="pb-1">Units per level</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tier, i) => (
                  <tr key={i}>
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
                    <td className="py-1">
                      <input
                        name="tierUnitsPerLevel"
                        type="number"
                        min={1}
                        defaultValue={tier?.unitsPerLevel ?? ""}
                        placeholder="12"
                        className="w-full rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm tnum text-text focus:border-navy focus:outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={() => setRows((r) => [...r, null])}
            className="mt-2 text-xs font-bold text-navy hover:underline"
          >
            + Add another break
          </button>
        </AdminForm>
      </div>
    </Panel>
  );
}
