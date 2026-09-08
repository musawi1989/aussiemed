"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useMemo, useState } from "react";
import { bulkCoverAction, setCoverAction } from "@/app/admin/suppliers/cover/actions";
import type { FormState } from "@/components/AdminForm";
import type { Rank } from "@/lib/ranks";

export type CoverRowView = {
  skuId: string;
  skuCode: string;
  unitLabel: string | null;
  productName: string;
  categoryName: string | null;
  primary: { supplierId: string; supplierName: string } | null;
  backup: { supplierId: string; supplierName: string } | null;
  third: { supplierId: string; supplierName: string } | null;
  demoted: {
    supplierName: string;
    rank: string;
    at: Date;
    backInStock: boolean;
  } | null;
};

export type SupplierOption = { id: string; name: string };

/**
 * Cover, as a list you work down.
 *
 * Two ways to change a row, deliberately, because they suit different jobs.
 * The select on a row is for the one pack somebody came here about. The
 * tick-boxes and the bar are for the forty packs a new supplier has just taken
 * on, which is the case that made this screen worth building — moving those
 * one at a time is forty page loads.
 *
 * The bar only appears once something is ticked. A bulk control sitting on
 * screen with nothing selected is a control that gets used by accident.
 *
 * NOTHING HERE IS VISIBLE TO A SUPPLIER. Rank governs who receives a purchase
 * order and is AussieMed's own position; the portal does not even fetch it.
 */
export function CoverTable({
  rows,
  suppliers,
}: {
  rows: CoverRowView[];
  suppliers: SupplierOption[];
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  const allOnPage = useMemo(() => rows.map((r) => r.skuId), [rows]);
  const allTicked = ticked.size > 0 && allOnPage.every((id) => ticked.has(id));

  const toggle = (skuId: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(skuId)) next.delete(skuId);
      else next.add(skuId);
      return next;
    });

  const toggleAll = () =>
    setTicked(allTicked ? new Set() : new Set(allOnPage));

  return (
    <div className="mt-4">
      {ticked.size > 0 && (
        <BulkBar
          skuIds={[...ticked]}
          suppliers={suppliers}
          onDone={() => setTicked(new Set())}
        />
      )}

      <div className="mt-3 overflow-x-auto rounded-card border border-border-base bg-surface shadow-card">
        <table className="w-full min-w-[58rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-base text-left text-xs uppercase tracking-wide text-text-subtle">
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allTicked}
                  onChange={toggleAll}
                  aria-label="Select every pack on this page"
                  className="cursor-pointer"
                />
              </th>
              <th className="px-3 py-2 font-bold">Item</th>
              <th className="px-3 py-2 font-bold">SKU</th>
              <th className="px-3 py-2 font-bold">Category</th>
              <th className="px-3 py-2 font-bold">Primary</th>
              <th className="px-3 py-2 font-bold">Secondary</th>
              <th className="px-3 py-2 font-bold">Third</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.skuId}
                className={`border-b border-border-base last:border-0 ${
                  ticked.has(row.skuId) ? "bg-navy-soft" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={ticked.has(row.skuId)}
                    onChange={() => toggle(row.skuId)}
                    aria-label={`Select ${row.skuCode}`}
                    className="cursor-pointer"
                  />
                </td>
                <td className="px-3 py-2">
                  <span className="font-semibold text-text">{row.productName}</span>
                  {row.unitLabel && (
                    <span className="block text-xs text-text-subtle">
                      {row.unitLabel}
                    </span>
                  )}
                  {/* Said on the row that changed, not gathered into a list
                      somewhere else: the decision it asks for — put them back
                      or leave them — is made in the selects to the right, and
                      a notice on another screen would be read nowhere near
                      the controls that answer it. */}
                  {row.demoted && (
                    <span
                      className={`mt-1 block text-xs ${
                        row.demoted.backInStock ? "text-accent" : "text-text-subtle"
                      }`}
                    >
                      {row.demoted.supplierName} went out of stock and is now{" "}
                      {row.demoted.rank.toLowerCase()}
                      {row.demoted.backInStock
                        ? " — back in stock, still demoted"
                        : " — still out of stock"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 tnum text-text-muted">{row.skuCode}</td>
                <td className="px-3 py-2 text-text-muted">
                  {row.categoryName ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <RankSelect
                    skuId={row.skuId}
                    rank="Primary"
                    current={row.primary?.supplierId ?? ""}
                    suppliers={suppliers}
                  />
                </td>
                <td className="px-3 py-2">
                  <RankSelect
                    skuId={row.skuId}
                    rank="Backup"
                    current={row.backup?.supplierId ?? ""}
                    suppliers={suppliers}
                  />
                </td>
                <td className="px-3 py-2">
                  <RankSelect
                    skuId={row.skuId}
                    rank="Third"
                    current={row.third?.supplierId ?? ""}
                    suppliers={suppliers}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="mt-4 rounded-card border border-border-base bg-surface px-4 py-10 text-center text-sm text-text-muted shadow-card">
          No packs match these filters.
        </p>
      )}
    </div>
  );
}

/**
 * One rank on one pack.
 *
 * Submits on change rather than behind a save button: this is a screen for
 * working down a list, and a save button per cell is a screen nobody finishes.
 * The refusal, when there is one, sits under the select that caused it.
 */
function RankSelect({
  skuId,
  rank,
  current,
  suppliers,
}: {
  skuId: string;
  rank: Rank;
  current: string;
  suppliers: SupplierOption[];
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    setCoverAction,
    null
  );

  return (
    <RestoringForm state={state} saveAll={true} action={submit}>
      <input type="hidden" name="skuId" value={skuId} />
      <input type="hidden" name="rank" value={rank} />
      <select
        name="supplierId"
        defaultValue={current}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full max-w-[13rem] cursor-pointer rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm text-text disabled:opacity-60"
      >
        <option value="">— nobody —</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {state?.ok === false && state.error && (
        <span role="alert" className="mt-1 block text-xs font-semibold text-danger">
          {state.error}
        </span>
      )}
    </RestoringForm>
  );
}

/** The bar that appears when something is ticked. */
function BulkBar({
  skuIds,
  suppliers,
  onDone,
}: {
  skuIds: string[];
  suppliers: SupplierOption[];
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    bulkCoverAction,
    null
  );

  return (
    <div className="rounded-card border border-navy-border bg-navy-soft p-3">
      <form
        action={(data) => {
          submit(data);
          onDone();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        {/* Every ticked pack rides along as its own field, so the action reads
            one list and does not have to parse a joined string. */}
        {skuIds.map((id) => (
          <input key={id} type="hidden" name="skuId" value={id} />
        ))}

        <span className="mr-1 text-sm font-bold tnum text-navy">
          {skuIds.length} selected
        </span>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-text">Set</span>
          <select
            name="rank"
            defaultValue="Primary"
            className="h-9 cursor-pointer rounded-card border border-border-strong bg-surface px-2 text-sm text-text"
          >
            <option value="Primary">Primary</option>
            <option value="Backup">Secondary</option>
            <option value="Third">Third</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-text">To</span>
          <select
            name="supplierId"
            defaultValue=""
            className="h-9 cursor-pointer rounded-card border border-border-strong bg-surface px-2 text-sm text-text"
          >
            <option value="">— nobody (clear) —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="h-9 cursor-pointer rounded-card bg-navy px-4 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
        >
          {pending ? "Applying…" : "Apply to selected"}
        </button>
      </form>

      {state?.ok === false && state.error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-danger">
          {state.error}
        </p>
      )}
      {state?.ok === true && state.message && (
        <p role="status" className="mt-2 text-xs font-semibold text-success">
          {state.message}
        </p>
      )}
    </div>
  );
}
