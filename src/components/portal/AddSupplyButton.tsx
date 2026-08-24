"use client";

import { useActionState } from "react";
import { addToMySupplyAction } from "@/app/business-portal/actions";
import type { FormState } from "@/components/AdminForm";

/**
 * One row's Add.
 *
 * Its own form per row rather than one form with checkboxes: a supplier
 * browsing a catalogue adds the two things they recognise, not a batch. Its
 * own action state too, so a refusal — already on your list — appears against
 * the row that caused it rather than at the top of a page of a hundred.
 *
 * The row stays on screen after adding rather than disappearing. A list that
 * rearranges under the pointer while somebody is reading down it is a list
 * they lose their place in; the next page load removes it.
 */
export function AddSupplyButton({ skuId }: { skuId: string }) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    addToMySupplyAction,
    null
  );

  const added = state?.ok === true;

  return (
    <form action={submit} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="skuId" value={skuId} />

      {added ? (
        <span className="text-xs font-bold text-success">
          {state.message ?? "Added"}
        </span>
      ) : (
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-card bg-navy px-3 py-1.5 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      )}

      {state?.ok === false && state.error && (
        <span role="alert" className="text-xs font-semibold text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}
