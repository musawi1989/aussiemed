"use client";
import { EntityLogo } from "@/components/EntityLogo";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { useRestored } from "@/components/AdminForm";

export function SupplierPicker({ name = "supplierId", label, suppliers, defaultValue = "", onChange }: {
  name?: string; label: string; suppliers: { id: string; companyName: string }[]; defaultValue?: string; onChange?: (value: string) => void;
}) {
  const id = useId();
  const restored = useRestored(name);
  const [value, setValue] = useState(restored ?? defaultValue);
  useEffect(() => { onChange?.(value); }, [value, onChange]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { setValue(restored ?? defaultValue); }, [restored, defaultValue]);
  useEffect(() => {
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const choices = suppliers.filter(s => s.companyName.toLowerCase().includes(query.trim().toLowerCase()));
  return <div ref={root} className="relative min-w-0 flex-1" onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}>
    <span id={id + "-label"} className="mb-1 block text-xs font-bold text-text">{label}</span>
    <input type="hidden" name={name} value={value} />
    <button type="button" aria-labelledby={id + "-label " + id + "-value"} aria-expanded={open} aria-controls={id} onClick={() => { setOpen(!open); setQuery(""); }} className="flex min-h-9 w-full items-center justify-between gap-2 rounded-card border border-border-strong bg-surface px-3 py-2 text-left text-sm text-text">
      <span id={id + "-value"} className="break-words"><EntityLogo kind="supplier" id={value} />{suppliers.find(s => s.id === value)?.companyName ?? "Not assigned"}</span><ChevronDown size={16} className="shrink-0" />
    </button>
    {open && <div id={id} className="absolute left-0 right-0 top-full z-30 mt-1 rounded-card border border-border-strong bg-surface p-2 shadow-lg">
      <div className="mb-2 flex items-center gap-2 border-b border-border-base pb-2"><Search size={16} /><input autoFocus type="search" aria-label={`Search ${label.toLowerCase()}`} value={query} onChange={e => setQuery(e.target.value)} className="min-w-0 flex-1 bg-surface px-1 py-1 text-sm text-text outline-none" /></div>
      <div className="max-h-56 overflow-auto" role="group" aria-label={label}>
        {[{ id: "", companyName: "Not assigned" }, ...choices].map(s => <button key={s.id} type="button" aria-pressed={value === s.id} onClick={() => { setValue(s.id); setOpen(false); }} className="flex min-h-9 w-full items-center justify-between gap-2 rounded-card px-2 py-2 text-left text-sm hover:bg-surface-hover">
          <span className="break-words"><EntityLogo kind="supplier" id={s.id} name={s.companyName} />{s.companyName}</span>{value === s.id && <Check size={16} className="shrink-0" />}
        </button>)}
        {!choices.length && <p className="px-2 py-2 text-sm text-text-muted">No matching suppliers</p>}
      </div>
    </div>}
  </div>;
}
