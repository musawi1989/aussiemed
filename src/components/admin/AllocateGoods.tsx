"use client";
import { useActionState, useState } from "react";
import { RestoringForm } from "@/components/AdminForm";
import { allocateGoodsAction } from "@/app/admin/orders/inbound/actions";

export function AllocateGoods({ receiptId, orderItemId, max }: { receiptId: string; orderItemId: string; max: number }) {
  const [state, submit, pending] = useActionState(allocateGoodsAction, null);
  const [key] = useState(() => crypto.randomUUID());
  return <RestoringForm action={submit} state={state} saveAll={false}>
    <input type="hidden" name="receiptId" value={receiptId} /><input type="hidden" name="orderItemId" value={orderItemId} /><input type="hidden" name="requestKey" value={key} />
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label="Quantity to allocate" name="qty" type="number" min={1} max={max} step={1} defaultValue={max} required className="h-9 w-20 rounded-card border border-border-strong bg-surface px-2" />
      <button type="submit" disabled={pending} className="min-h-9 rounded-card bg-navy px-3 py-2 text-xs font-bold text-on-navy disabled:opacity-60">{pending ? "Allocating..." : "Mark allocated"}</button>
    </div>
    {state && <p role={state.ok ? "status" : "alert"} className={`mt-1 text-xs ${state.ok ? "text-success" : "text-danger"}`}>{state.message ?? state.error}</p>}
  </RestoringForm>;
}
