"use client";
import { RestoringForm } from "@/components/AdminForm";
import { useActionState } from "react";
import { removeSupplierAction } from "@/app/admin/suppliers/actions";
export function RemoveSupplier({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(removeSupplierAction, null);
  return <RestoringForm state={state} saveAll={false} action={action} onSubmit={event => { if (!confirm(`Remove ${name}? Portal access will be disabled. A supplier with linked products or historical orders will be archived, not permanently deleted.`)) event.preventDefault(); }} className="mt-4 border-t border-border-base pt-4">
    <input type="hidden" name="id" value={id} />
    <button type="submit" disabled={pending || state?.ok === true} className="text-sm font-semibold text-danger disabled:opacity-60">{pending ? "Removing..." : "Remove supplier"}</button>
    {state && <p role={state.ok ? "status" : "alert"} className="mt-2 text-xs">{state.ok ? state.message : state.error}</p>}
  </RestoringForm>;
}
