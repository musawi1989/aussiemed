"use client";
import { RestoringForm } from "@/components/AdminForm";
import { useActionState } from "react";
import { setBrandActiveAction } from "@/app/admin/products/brands/actions";
export function BrandStatusForm({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [state, action, pending] = useActionState(setBrandActiveAction, null);
  return <RestoringForm state={state} saveAll={false} action={action} onSubmit={event => { if (active && !confirm(`Remove ${name} from new-product choices? Existing products will keep their recorded brand.`)) event.preventDefault(); }}>
    <input type="hidden" name="id" value={id} /><input type="hidden" name="isActive" value={active ? "0" : "1"} />
    <button disabled={pending} className={`text-xs font-semibold ${active ? "text-danger" : "text-navy"}`}>{pending ? "Saving..." : active ? "Remove" : "Restore"}</button>
    {state?.ok === false && <p role="alert" className="text-xs text-danger">{state.error}</p>}
  </RestoringForm>;
}
