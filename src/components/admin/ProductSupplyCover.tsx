"use client";
import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useState } from "react";
import { setProductCoverAction } from "@/app/admin/products/[id]/actions";
import type { CoverCandidate, ProductCover, HeldRank, Rank } from "@/lib/supply-cover";
import { SupplierPicker } from "./SupplierPicker";

type SupplyPrice = { skuId: string; supplierId: string; costFils: number | null };

export function ProductSupplyCover({ productId, slug, totalPacks, slots, candidates, packs, prices }: {
  prices: SupplyPrice[];
  packs: { id: string; skuCode: string }[];
  productId: string; slug: string; totalPacks: number; slots: ProductCover["slots"]; candidates: CoverCandidate[];
}) {
  return <div className="mt-3 space-y-4">
    {slots.map(slot => <RankPicker key={slot.rank} prices={prices} packs={packs} productId={productId} slug={slug} rank={slot.rank} label={slot.label + " supplier"} held={slot.held} candidates={candidates} />)}
    <p className="text-xs text-text-muted">{totalPacks} active pack{totalPacks === 1 ? "" : "s"}</p>
  </div>;
}
function RankPicker({ productId, slug, rank, label, held, candidates, packs, prices }: {
  prices: SupplyPrice[];
  packs: { id: string; skuCode: string }[];
  productId: string; slug: string; rank: Rank; label: string; held: HeldRank; candidates: CoverCandidate[];
}) {
  const [state, submit, pending] = useActionState(setProductCoverAction, null);
  const current = held.kind === "all" || held.kind === "some" ? held.supplierId : "";
  const [selected, setSelected] = useState(current);
  return <RestoringForm state={state} saveAll action={submit}>
    <input type="hidden" name="productId" value={productId} />
    <input type="hidden" name="slug" value={slug} />
    <input type="hidden" name="rank" value={rank} />
    <div className="flex items-end gap-2">
      <SupplierPicker label={label} defaultValue={current} onChange={setSelected} suppliers={candidates.map(c => ({ id: c.supplierId, companyName: c.companyName }))} />
      <button type="submit" disabled={pending} className="min-h-9 shrink-0 rounded-card bg-navy px-3 py-2 text-xs font-bold text-on-navy disabled:opacity-60">{pending ? "Saving..." : "Save"}</button>
    </div>
    {selected && <div key={selected} className="mt-2 grid gap-2 sm:grid-cols-2">{packs.map(pack => <label key={pack.id} className="text-xs font-semibold">Buying price for {pack.skuCode} (AED per pack, excluding VAT)<input name={`buyingPrice:${pack.id}`} type="number" defaultValue={(() => { const cost = prices.find(price => price.skuId === pack.id && price.supplierId === selected)?.costFils; return cost == null ? "" : (cost / 100).toFixed(2); })()} required min="0.01" step="0.01" className="mt-1 block w-full rounded-card border border-border-strong bg-surface px-3 py-2" /></label>)}</div>}
    {held.kind === "mixed" && <p className="mt-1 text-xs text-accent">Mixed: {held.holders.map(h => h.companyName).join(", ")}</p>}
    {state?.ok === false && <p role="alert" className="mt-1 text-xs text-danger">{state.error}</p>}
    {state?.ok && <p role="status" className="mt-1 text-xs text-success">{state.message}</p>}
  </RestoringForm>;
}
