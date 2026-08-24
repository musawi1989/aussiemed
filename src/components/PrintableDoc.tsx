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
  backLabel = "Back to the order",
  downloadHref,
  children,
}: {
  title: string;
  backHref: string;
  /** Orders are no longer the only thing printed through here. */
  backLabel?: string;
  /**
   * A route that returns this document as a file, where one exists.
   *
   * Passed in rather than derived: print() can never save silently — it always
   * opens the dialogue — so one-click download has to be a server render, and
   * only some documents have one built.
   */
  downloadHref?: string;
  children: React.ReactNode;
}) {
  return (
    // print-document: on paper this is the ONLY thing that exists. The rule
    // in globals.css hides everything outside it, which is what stops a
    // document rendered inside the shop layout coming out wrapped in the site
    // header, the search box, the cutoff banner and the whole dark footer.
    // Here rather than on each page so a document cannot be added without it.
    <div className="print-document mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={backHref}
          className="text-sm font-semibold text-text-muted hover:text-navy"
        >
          &larr; {backLabel}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {downloadHref && (
            /* A plain link, not fetch-then-blob: the browser saves what the
               server sends and the Content-Disposition header does the rest.
               Nothing to spin, nothing to clean up. */
            <a
              href={downloadHref}
              className="cursor-pointer rounded-card border border-border-strong bg-surface px-4 py-2 text-sm font-bold text-text transition-colors hover:border-navy hover:text-navy"
            >
              Download PDF
            </a>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="cursor-pointer rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover"
          >
            Print or save as PDF
          </button>
        </div>
      </div>

      <h1 className="mt-5 text-2xl font-bold tracking-tight text-text print:mt-0">
        {title}
      </h1>

      {children}
    </div>
  );
}
