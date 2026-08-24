"use client";

import Link from "next/link";

/**
 * The frame around a printable order document.
 *
 * These are HTML rather than generated PDFs: the browser's own print dialogue
 * makes a PDF, and that avoids a rendering dependency whose output nobody can
 * check without running it. `print:hidden` takes the controls off the paper.
 */
export function PrintableDoc({
  title,
  backHref,
  children,
}: {
  title: string;
  backHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={backHref}
          className="text-sm font-semibold text-text-muted hover:text-navy"
        >
          &larr; Back to the order
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover"
        >
          Print or save as PDF
        </button>
      </div>

      <h1 className="mt-5 text-2xl font-bold tracking-tight text-text print:mt-0">
        {title}
      </h1>

      {children}
    </div>
  );
}
