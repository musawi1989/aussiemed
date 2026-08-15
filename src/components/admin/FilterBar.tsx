"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * The chip row above the orders table.
 *
 * Each chip opens a small panel and writes its answer straight into the URL.
 * Filters being URL state rather than component state is what makes a view
 * worth having: "every unpaid Net 30 order over 500" is a link someone can
 * send to accounts, and the back button undoes exactly one decision.
 */

export type ChipDef =
  | {
      kind: "multi";
      key: string;
      label: string;
      options: { value: string; label: string }[];
    }
  | { kind: "dateRange"; keyFrom: string; keyTo: string; label: string }
  | { kind: "amountRange"; keyMin: string; keyMax: string; label: string };

export function FilterBar({
  basePath,
  chips,
  searchPlaceholder,
}: {
  basePath: string;
  chips: ChipDef[];
  searchPlaceholder: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /** Any filter change resets to page 1: page 4 of the old result set is never what was meant. */
  const apply = (changes: Record<string, string[] | string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      next.delete(key);
      if (Array.isArray(value)) {
        for (const v of value) next.append(key, v);
      } else if (value) {
        next.set(key, value);
      }
    }
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
    setOpen(null);
  };

  const activeCount = (chip: ChipDef): number => {
    if (chip.kind === "multi") return params.getAll(chip.key).length;
    if (chip.kind === "dateRange") {
      return [chip.keyFrom, chip.keyTo].filter((k) => params.get(k)).length;
    }
    return [chip.keyMin, chip.keyMax].filter((k) => params.get(k)).length;
  };

  const anyActive =
    chips.some((c) => activeCount(c) > 0) || Boolean(params.get("q"));

  const chipId = (chip: ChipDef) =>
    chip.kind === "multi"
      ? chip.key
      : chip.kind === "dateRange"
        ? chip.keyFrom
        : chip.keyMin;

  return (
    <div ref={barRef} className="mt-4 flex flex-wrap items-center gap-2">
      {chips.map((chip) => {
        const id = chipId(chip);
        const count = activeCount(chip);
        return (
          <div key={id} className="relative">
            <button
              type="button"
              onClick={() => setOpen(open === id ? null : id)}
              aria-expanded={open === id}
              className={`flex items-center gap-1.5 rounded-card border px-3 py-2 text-sm font-semibold transition-colors ${
                count > 0
                  ? "border-navy bg-navy-soft text-navy"
                  : "border-border-strong bg-surface text-text-muted hover:text-navy"
              }`}
            >
              {chip.label}
              {count > 0 && (
                <span className="rounded-full bg-navy px-1.5 text-xs font-bold text-on-navy tnum">
                  {count}
                </span>
              )}
            </button>

            {open === id && (
              <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-card border border-border-base bg-surface p-3 shadow-raised">
                {chip.kind === "multi" && (
                  <MultiPanel
                    label={chip.label}
                    options={chip.options}
                    selected={params.getAll(chip.key)}
                    onApply={(values) => apply({ [chip.key]: values })}
                  />
                )}
                {chip.kind === "dateRange" && (
                  <RangePanel
                    type="date"
                    label={chip.label}
                    fromValue={params.get(chip.keyFrom) ?? ""}
                    toValue={params.get(chip.keyTo) ?? ""}
                    onApply={(from, to) =>
                      apply({ [chip.keyFrom]: from, [chip.keyTo]: to })
                    }
                  />
                )}
                {chip.kind === "amountRange" && (
                  <RangePanel
                    type="number"
                    label={chip.label}
                    fromValue={params.get(chip.keyMin) ?? ""}
                    toValue={params.get(chip.keyMax) ?? ""}
                    onApply={(from, to) =>
                      apply({ [chip.keyMin]: from, [chip.keyMax]: to })
                    }
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {anyActive && (
        <button
          type="button"
          onClick={() => router.push(basePath)}
          className="rounded-card px-2.5 py-2 text-sm font-semibold text-text-muted transition-colors hover:text-red"
        >
          Clear all
        </button>
      )}

      <form
        className="ml-auto"
        onSubmit={(e) => {
          e.preventDefault();
          const value = String(new FormData(e.currentTarget).get("q") ?? "");
          apply({ q: value.trim() || null });
        }}
      >
        <input
          name="q"
          defaultValue={params.get("q") ?? ""}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="w-64 rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none"
        />
      </form>
    </div>
  );
}

function MultiPanel({
  label,
  options,
  selected,
  onApply,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onApply: (values: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>(selected);
  const allOn = picked.length === options.length;

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </p>

      <label className="mt-2 flex items-center gap-2 border-b border-border-base pb-2 text-sm">
        <input
          type="checkbox"
          checked={allOn}
          onChange={() => setPicked(allOn ? [] : options.map((o) => o.value))}
          className="h-4 w-4 accent-[var(--color-navy)]"
        />
        <span className="font-semibold text-text">Select all</span>
      </label>

      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={picked.includes(option.value)}
              onChange={() =>
                setPicked((p) =>
                  p.includes(option.value)
                    ? p.filter((v) => v !== option.value)
                    : [...p, option.value]
                )
              }
              className="h-4 w-4 accent-[var(--color-navy)]"
            />
            <span className="text-text-muted">{option.label}</span>
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onApply(picked)}
        className="mt-3 w-full rounded-card bg-navy px-3 py-1.5 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover"
      >
        Apply
      </button>
    </div>
  );
}

function RangePanel({
  type,
  label,
  fromValue,
  toValue,
  onApply,
}: {
  type: "date" | "number";
  label: string;
  fromValue: string;
  toValue: string;
  onApply: (from: string | null, to: string | null) => void;
}) {
  const [from, setFrom] = useState(fromValue);
  const [to, setTo] = useState(toValue);

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </p>
      <div className="mt-2 space-y-2">
        <label className="block">
          <span className="text-xs text-text-subtle">
            {type === "date" ? "From" : "Minimum (AED)"}
          </span>
          <input
            type={type}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-0.5 w-full rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm tnum text-text focus:border-navy focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs text-text-subtle">
            {type === "date" ? "To" : "Maximum (AED)"}
          </span>
          <input
            type={type}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-0.5 w-full rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm tnum text-text focus:border-navy focus:outline-none"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => onApply(from || null, to || null)}
        className="mt-3 w-full rounded-card bg-navy px-3 py-1.5 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover"
      >
        Apply
      </button>
    </div>
  );
}
