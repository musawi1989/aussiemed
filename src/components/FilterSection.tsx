"use client";

import { useState, type ReactNode } from "react";

/**
 * A filter section that folds away.
 *
 * The brand list is the reason: it is every brand in whatever the buyer is
 * looking at, which on the full catalogue is dozens of rows sitting between
 * them and nothing at all. A section that can be shut is better than a section
 * that is trimmed to eight with a "show more", because the buyer decides what
 * they are working with rather than the component deciding for them.
 *
 * Open by default unless told otherwise, and a section holding an active filter
 * opens regardless — a filter you cannot see is a filter you cannot clear.
 */
export function FilterSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  /** Shown beside the heading, so a shut section still says how much is in it. */
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        // cursor-pointer because Tailwind 4 preflight sets buttons to
        // cursor: default, unlike v3. Every row under this heading is a link
        // and gets a pointer from the browser; the heading that folds them away
        // is the one control here that looked inert while being clickable.
        className="mb-2 flex w-full cursor-pointer items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-semibold text-text">
          {title}
          {count !== undefined && (
            <span className="ml-1.5 tnum text-xs font-normal text-text-subtle">
              {count}
            </span>
          )}
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-text-subtle transition-transform ${
            open ? "" : "-rotate-90"
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && children}
    </section>
  );
}
