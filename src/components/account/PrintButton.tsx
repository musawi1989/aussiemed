"use client";

/**
 * Saving the invoice.
 *
 * The browser's own print dialogue is the PDF generator here — every one of
 * them offers "Save as PDF", and the page is laid out so the chrome drops away
 * on paper. Adding a PDF library to produce the same file server-side is a
 * dependency and a decision nobody has asked for yet.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-10 rounded-card bg-brand px-5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover"
    >
      Print or save as PDF
    </button>
  );
}
