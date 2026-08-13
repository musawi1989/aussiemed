"use client";

import { useEffect, useState } from "react";
import { normaliseQty } from "@/lib/money";

/**
 * Quantity control with both steppers and free text entry. B2B buyers order in
 * dozens or hundreds, so typing "144" must work as well as clicking + 143 times.
 *
 * The field holds a raw string while focused so the user can clear it and type,
 * then snaps to a valid integer on blur.
 */
export function QtyInput({
  value,
  onChange,
  min = 1,
  label = "Quantity",
  size = "md",
  block = false,
}: {
  value: number;
  onChange: (qty: number) => void;
  min?: number;
  label?: string;
  size?: "sm" | "md";
  /** Fills the available width, pushing the steppers to either edge. */
  block?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    const next = Number.isNaN(parsed) ? min : normaliseQty(parsed, min);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  const step = (delta: number) => {
    const next = normaliseQty(value + delta, min);
    onChange(next);
  };

  const btn =
    size === "sm"
      ? "h-8 w-8 shrink-0 text-base"
      : "h-10 w-10 shrink-0 text-lg";
  const field = `${size === "sm" ? "h-8 text-sm" : "h-10 text-base"} ${
    block ? "w-full flex-1" : size === "sm" ? "w-12" : "w-16"
  }`;

  return (
    <div
      className={`items-stretch rounded-card border border-border-strong bg-surface ${
        block ? "flex w-full" : "inline-flex"
      }`}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={value <= min}
        aria-label={`Decrease ${label.toLowerCase()}`}
        className={`${btn} flex items-center justify-center rounded-l-card text-text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-35`}
      >
        &minus;
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        value={draft}
        min={min}
        step={1}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit((e.target as HTMLInputElement).value);
          }
        }}
        className={`${field} border-x border-border-base bg-transparent text-center font-medium tnum text-text outline-none`}
      />
      <button
        type="button"
        onClick={() => step(1)}
        aria-label={`Increase ${label.toLowerCase()}`}
        className={`${btn} flex items-center justify-center rounded-r-card text-text-muted transition-colors hover:bg-surface-hover hover:text-text`}
      >
        +
      </button>
    </div>
  );
}
