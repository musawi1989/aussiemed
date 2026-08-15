"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  COLUMNS,
  DEFAULT_COLUMNS,
  type ColumnKey,
} from "@/lib/order-views";

/**
 * Which columns the table shows, and in what order.
 *
 * Kept in the URL rather than in local storage so a configured view is a link.
 * Someone in accounts wants TRN and terms visible; the warehouse wants ship-by
 * and tracking. Both are one URL each, and neither has to reconfigure the
 * other's screen back afterwards.
 */
export function ColumnPicker({
  basePath,
  selected,
}: {
  basePath: string;
  selected: ColumnKey[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<ColumnKey[]>(selected);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const push = (cols: ColumnKey[]) => {
    const next = new URLSearchParams(params.toString());
    // Order matters, so the value is the picked order, not the catalogue order.
    next.set("cols", cols.join(","));
    router.push(`${basePath}?${next.toString()}`);
    setOpen(false);
  };

  const visible = COLUMNS.filter((c) =>
    c.label.toLowerCase().includes(search.trim().toLowerCase())
  );

  const toggle = (key: ColumnKey) =>
    setPicked((p) =>
      p.includes(key) ? p.filter((k) => k !== key) : [...p, key]
    );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-card border border-border-strong bg-surface px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:text-navy"
      >
        Manage columns
        <span className="text-xs tnum text-text-subtle">({picked.length})</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-card border border-border-base bg-surface p-3 shadow-raised">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
              Select columns
            </p>
            <button
              type="button"
              onClick={() => setPicked(DEFAULT_COLUMNS)}
              className="text-xs font-bold text-navy hover:underline"
            >
              Reset
            </button>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by column"
            aria-label="Search by column"
            className="mt-2 w-full rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm text-text focus:border-navy focus:outline-none"
          />

          <div className="mt-2 max-h-80 space-y-1 overflow-y-auto pr-1">
            {visible.map((column) => (
              <label
                key={column.key}
                className="flex items-start gap-2 rounded px-1 py-0.5 text-sm hover:bg-surface-hover"
              >
                <input
                  type="checkbox"
                  checked={picked.includes(column.key)}
                  onChange={() => toggle(column.key)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-navy)]"
                />
                <span>
                  <span className="block text-text">{column.label}</span>
                  {column.hint && (
                    <span className="block text-xs leading-snug text-text-subtle">
                      {column.hint}
                    </span>
                  )}
                </span>
              </label>
            ))}
            {visible.length === 0 && (
              <p className="px-1 py-2 text-sm text-text-muted">
                No column matches that.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => push(picked)}
            disabled={picked.length === 0}
            className="mt-3 w-full rounded-card bg-navy px-3 py-1.5 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-50"
          >
            Apply
          </button>
          {picked.length === 0 && (
            <p className="mt-1 text-center text-xs text-text-subtle">
              Keep at least one column.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
