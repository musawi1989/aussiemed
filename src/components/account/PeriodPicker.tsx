"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * Going back in time.
 *
 * The presets are the questions people actually ask — this year, last year,
 * the last three months — and the custom range is there for the ones they ask
 * an accountant. Everything lives in the URL rather than in component state,
 * so a buyer can bookmark last year's figures or send the link to their
 * bookkeeper and both see the same thing.
 */
const PRESETS = [
  { key: "last3", label: "Last 3 months" },
  { key: "last12", label: "Last 12 months" },
  { key: "thisYear", label: "This year" },
  { key: "lastYear", label: "Last year" },
  { key: "all", label: "Everything" },
] as const;

export function PeriodPicker({
  activeKey,
  from,
  to,
}: {
  activeKey: string;
  from: string;
  to: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(activeKey === "custom");

  const href = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("period", key);
    next.delete("from");
    next.delete("to");
    return `${pathname}?${next.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((preset) => (
        <Link
          key={preset.key}
          href={href(preset.key)}
          aria-current={activeKey === preset.key ? "true" : undefined}
          className={`rounded-card px-3 py-1.5 text-sm font-bold transition-colors ${
            activeKey === preset.key
              ? "bg-navy text-on-navy"
              : "border border-border-strong bg-surface text-text-muted hover:text-navy"
          }`}
        >
          {preset.label}
        </Link>
      ))}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`rounded-card px-3 py-1.5 text-sm font-bold transition-colors ${
          activeKey === "custom"
            ? "bg-navy text-on-navy"
            : "border border-border-strong bg-surface text-text-muted hover:text-navy"
        }`}
      >
        Pick dates
      </button>

      {open && (
        // A plain GET form: the range ends up in the URL like every other
        // choice here, so it can be bookmarked and shared.
        <form method="get" action={pathname} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="period" value="custom" />
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-text-muted">From</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="h-9 rounded-card border border-border-strong bg-surface px-2.5 text-sm text-text"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-text-muted">To</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="h-9 rounded-card border border-border-strong bg-surface px-2.5 text-sm text-text"
            />
          </label>
          <button
            type="submit"
            className="h-9 rounded-card bg-brand px-4 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover"
          >
            Show
          </button>
        </form>
      )}
    </div>
  );
}
