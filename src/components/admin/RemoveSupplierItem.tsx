"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState } from "react";
import { removeSupplierItemAction } from "@/app/admin/suppliers/[id]/item-actions";
import type { FormState } from "@/components/AdminForm";

/**
 * Taking one pack off a supplier's list.
 *
 * ONLY RENDERED ON OFFERS. Cover is refused by the service behind this, and a
 * button that always refuses is a worse way of saying so than not offering it
 * — the same lesson as the supplier portal's own Remove. Cover comes off on
 * the Cover screen, where the slot it empties is visible while you do it.
 */
export function RemoveSupplierItem({
  supplierId,
  supplyId,
  name,
}: {
  supplierId: string;
  supplyId: string;
  name: string;
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    removeSupplierItemAction,
    null
  );

  return (
    <RestoringForm state={state} saveAll={false} action={submit} className="shrink-0">
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="supplyId" value={supplyId} />
      <button
        type="submit"
        disabled={pending}
        title={`Take ${name} off their list`}
        onClick={(event) => {
          if (!window.confirm(`Take ${name} off this supplier's list?`)) {
            event.preventDefault();
          }
        }}
        className="text-[11px] font-bold text-danger hover:underline disabled:opacity-60"
      >
        {pending ? "…" : "Remove"}
      </button>
      {state?.ok === false && (
        <span role="alert" className="ml-1 text-[11px] font-semibold text-danger">
          {state.error}
        </span>
      )}
    </RestoringForm>
  );
}
