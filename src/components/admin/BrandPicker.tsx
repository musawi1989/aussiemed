"use client";
import { useState } from "react";
import { Field, useRestored } from "@/components/AdminForm";
export function BrandPicker({ brands }: { brands: { id: string; name: string }[] }) {
  const restored = useRestored("brandId");
  const [selected, setSelected] = useState(restored ?? "");
  return <div>
    <label className="block text-xs font-bold uppercase text-text-subtle">Brand <span className="text-red">*</span>
      <select name="brandId" required value={selected} onChange={event => setSelected(event.target.value)} className="mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm font-normal normal-case text-text">
        <option value="">Choose a brand</option>
        <option value="__generic__">Generic</option>
        {brands.filter(brand => brand.name.toLowerCase() !== "generic").map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        <option value="__new__">Add a brand...</option>
      </select>
    </label>
    {selected === "__new__" && <div className="mt-3"><Field label="New brand name" name="brandName" required maxLength={100} /></div>}
  </div>;
}
