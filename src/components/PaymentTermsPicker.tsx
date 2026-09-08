"use client";
import { useState } from "react";
import { useRestored } from "./AdminForm";
import { TERM_DAYS, customTerms, encodeCustomTerms, termsName } from "@/lib/payment-options";

export function PaymentTermsPicker({ value = "Net14", supplier = false }: { value?: string; supplier?: boolean }) {
  const restored = useRestored("paymentTerms");
  const initial = restored ?? value;
  const custom = customTerms(initial);
  const [choice, setChoice] = useState(custom ? "Other" : initial);
  const [days, setDays] = useState(String(custom?.days ?? 14));
  const [label, setLabel] = useState(custom?.label ?? "");
  const terms = choice === "Other" ? encodeCustomTerms(Number(days), label) : choice;
  return <div>
    <input type="hidden" name="paymentTerms" value={terms} />
    {supplier && <>
      <input type="hidden" name="paymentTermsDays" value={choice === "" ? "" : choice === "Other" ? days : String(TERM_DAYS[choice as keyof typeof TERM_DAYS] ?? "")} />
      <input type="hidden" name="paymentTermsLabel" value={choice === "Other" ? label : ""} />
    </>}
    <label className="block text-xs font-bold text-text">Payment terms
      <select aria-label="Payment terms" value={choice} onChange={e => setChoice(e.target.value)} className="mt-1 min-h-9 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm">
        {supplier && <option value="">Not agreed</option>}
        {Object.keys(TERM_DAYS).map(term => <option key={term} value={term}>{termsName(term)}</option>)}
        <option value="Other">Other</option>
      </select>
    </label>
    {choice === "Other" && <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_7rem]">
      <label className="block text-xs font-semibold">Custom payment terms<input aria-label="Custom payment terms" value={label} onChange={e => setLabel(e.target.value)} required maxLength={180} className="mt-1 min-h-9 w-full rounded-card border border-border-strong bg-surface px-2 text-sm" /></label>
      <label className="block text-xs font-semibold">Days until due<input aria-label="Days until due" type="number" min={0} max={365} step={1} value={days} onChange={e => setDays(e.target.value)} required className="mt-1 min-h-9 w-full rounded-card border border-border-strong bg-surface px-2 text-sm" /></label>
    </div>}
  </div>;
}
