"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useEffect, useState } from "react";
import {
  addPackAction,
  removePackAction,
} from "@/app/admin/products/[id]/actions";
import type { FormState } from "@/components/AdminForm";

const field =
  "mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none";
const label = "block text-xs font-bold uppercase tracking-wide text-text-subtle";

/**
 * Another pack of the same product — the box beside the single, the carton
 * beside the box.
 *
 * Folded shut until asked for. It is six fields, and a product page is mostly
 * read rather than edited; open by default it would push the packs that
 * already exist below the fold on every visit.
 */
export function AddPack({
  productId,
  masterSku,
  existingCodes,
  forValue,
}: {
  productId: string;
  masterSku: string;
  existingCodes: string[];
  /** The variant this pack is being created for, when one sent us here. */
  forValue?: { id: string; label: string } | null;
}) {
  // Open already when a variant was just added: the whole point of arriving
  // here is that something needs filling in.
  const [open, setOpen] = useState(Boolean(forValue));
  useEffect(() => { if (forValue) setOpen(true); }, [forValue?.id]);
  const [state, submit, saving] = useActionState<FormState, FormData>(
    addPackAction,
    null
  );

  // Only after a successful add, so a refusal keeps what was typed.
  const back = (key: string, fallback = "") =>
    (state?.ok === false ? state.values?.[key] : undefined) ?? fallback;

  if (!open) {
    return (
      <div className="mt-4 border-t border-border-base pt-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-card border border-border-strong bg-surface px-4 py-2 text-sm font-bold text-text transition-colors hover:border-navy hover:text-navy"
        >
          + Add another pack
        </button>
        <p className="mt-2 text-xs leading-relaxed text-text-subtle">
          A different size of the same product &mdash; a box of 12 beside the
          single. Buyers pick between them on the listing.
        </p>
        {state?.ok === true && (
          <p role="status" className="mt-2 text-xs font-semibold text-success">
            {state.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <RestoringForm state={state} saveAll={true}
      action={submit}
      className="mt-4 rounded-card border border-border-strong bg-surface-sunken p-4"
    >
      <input type="hidden" name="productId" value={productId} />
      {forValue && <input type="hidden" name="forValueId" value={forValue.id} />}

      <p className="text-sm font-bold text-text">
        {forValue ? `Add the ${forValue.label} pack` : "Add another pack"}
      </p>
      {forValue && (
        <p className="mt-0.5 text-xs text-text-muted">
          You have just added <b className="text-text">{forValue.label}</b>.
          Nothing is on sale as it yet — this is that pack. It will be set to{" "}
          {forValue.label} when it is created.
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Item code</span>
          <input
            name="skuCode"
            required
            defaultValue={back("skuCode", masterSku)}
            onInput={event => event.currentTarget.setCustomValidity(existingCodes.some(code => code.trim().toLowerCase() === event.currentTarget.value.trim().toLowerCase()) ? "Change the copied item code. Each pack must have its own unique SKU." : "")}
            ref={input => { if (input) input.setCustomValidity(existingCodes.some(code => code.trim().toLowerCase() === input.value.trim().toLowerCase()) ? "Change the copied item code. Each pack must have its own unique SKU." : ""); }}
            placeholder="TS-1032-12"
            className={field}
          />
          <span className="mt-1 block text-[11px] text-text-subtle">
            Must be unique across every pack on the site.
          </span>
        </label>

        <label className="block">
          <span className={label}>Price (AED)</span>
          <input
            name="priceAED"
            required
            inputMode="decimal"
            defaultValue={back("priceAED")}
            placeholder="207.08"
            className={field}
          />
          <span className="mt-1 block text-[11px] text-text-subtle">
            For the whole pack, excluding VAT.
          </span>
        </label>

        <label className="block">
          <span className={label}>Full pack label</span>
          <input
            name="unitLabel"
            required
            defaultValue={back("unitLabel")}
            placeholder="12 Each/Carton"
            className={field}
          />
          <span className="mt-1 block text-[11px] text-text-subtle">
            What the buyer reads on the listing.
          </span>
        </label>

        <label className="block">
          <span className={label}>Short pack name</span>
          <input
            name="unitShortLabel"
            defaultValue={back("unitShortLabel")}
            placeholder="Carton"
            className={field}
          />
          <span className="mt-1 block text-[11px] text-text-subtle">
            Beside Add to cart. Blank copies the unit label.
          </span>
        </label>

        <label className="block">
          <span className={label}>Base unit name</span>
          <input
            name="baseUnitName"
            defaultValue={back("baseUnitName")}
            placeholder="Each"
            className={field}
          />
        </label>

        <label className="block">
          <span className={label}>Units per pack</span>
          <input
            name="eachesPerPack"
            required
            inputMode="numeric"
            defaultValue={back("eachesPerPack", "1")}
            placeholder="12"
            className={field}
          />
          <span className="mt-1 block text-[11px] text-text-subtle">
            What makes the per-unit price comparable against the other packs.
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="h-9 rounded-card bg-navy px-4 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
        >
          {saving ? "Adding…" : "Add pack"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-card border border-border-strong bg-surface px-4 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
        >
          Cancel
        </button>
        {state?.ok === false && (
          <span role="alert" className="text-xs font-semibold text-danger">
            {state.error}
          </span>
        )}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-text-subtle">
        It goes live straight away. Price breaks are set on the pack once it
        exists.
      </p>
    </RestoringForm>
  );
}

/**
 * Taking a pack off.
 *
 * THE TWO OUTCOMES ARE SAID BEFORE THE CLICK, NOT AFTER. Whether this deletes
 * or has to be a retirement is decided by what already points at the pack, and
 * that is knowable on the server while the page renders — so the button says
 * which one it is rather than refusing afterwards and making somebody guess
 * what to do next.
 */
export function RemovePack({
  productId,
  skuId,
  skuCode,
  removal,
}: {
  productId: string;
  skuId: string;
  skuCode: string;
  /** From canRemovePack. Names what would break, when something would. */
  removal: { kind: "deletable" } | { kind: "retire-only"; because: string };
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    removePackAction,
    null
  );

  if (removal.kind === "retire-only") {
    return (
      <p className="mt-3 border-t border-border-base pt-3 text-xs leading-relaxed text-text-subtle">
        This pack is on <b className="text-text">{removal.because}</b>, so it
        cannot be deleted &mdash; those records would lose what they refer to.
        Untick <b className="text-text">Active</b> above to retire it: it comes
        off the storefront and the history stays.
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-base pt-3">
      <RestoringForm state={state} saveAll={false} action={submit}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="skuId" value={skuId} />
        <button
          type="submit"
          disabled={pending}
          onClick={(event) => {
            if (
              !window.confirm(
                `Delete pack ${skuCode}?\n\nNothing has been ordered in it, so it can go for good. This cannot be undone.`
              )
            ) {
              event.preventDefault();
            }
          }}
          className="rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:border-danger disabled:opacity-60"
        >
          {pending ? "Removing…" : "Delete this pack"}
        </button>
      </RestoringForm>
      <span className="text-xs text-text-subtle">
        Nothing has been ordered in it, so it can go for good.
      </span>
      {state?.ok === false && (
        <span role="alert" className="text-xs font-semibold text-danger">
          {state.error}
        </span>
      )}
    </div>
  );
}
