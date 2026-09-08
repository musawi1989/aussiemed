"use client";
import { AdminForm, Field, Select } from "./AdminForm";
import { updateDocketAction } from "@/app/business-portal/docket-actions";
import type { DocketSummary } from "@/lib/dockets";

export function DocketEditor({ docket }: { docket: Pick<DocketSummary, "id" | "lines" | "courier" | "trackingNumber" | "note" | "dispatchedAt"> }) {
  return <details className="mt-2 w-full border-t border-border-base pt-2">
    <summary className="cursor-pointer text-xs font-semibold text-navy">Edit quantities / tracking</summary>
    <AdminForm action={updateDocketAction} submitLabel="Save docket" className="mt-3">
      <input type="hidden" name="id" value={docket.id} />
      <div className="space-y-2">{docket.lines.map(line => <label key={line.purchaseOrderLineId} className="flex items-center justify-between gap-3 text-xs text-text">
        <span className="min-w-0 break-words">{line.name} <span className="text-text-muted">{line.code}</span></span>
        <input type="hidden" name="docketLineId" value={line.purchaseOrderLineId} />
        <input aria-label={`${line.name} quantity`} name="docketQty" type="number" min="0" step="1" required defaultValue={line.qty} className="w-20 shrink-0 rounded-card border border-border-strong bg-surface p-2 text-text" />
      </label>)}</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Courier" name="courier" defaultValue={docket.courier} />
        <Field label="Tracking number" name="trackingNumber" defaultValue={docket.trackingNumber} />
        <Select label="Dispatch" name="dispatched" defaultValue={docket.dispatchedAt ? "1" : "0"} options={[{ value: "0", label: "Prepared" }, { value: "1", label: "Dispatched" }]} />
        <Field label="Docket note" name="note" defaultValue={docket.note} />
      </div>
      <div className="mt-3"><Field label="Reason for update" name="reason" required /></div>
    </AdminForm>
  </details>;
}
