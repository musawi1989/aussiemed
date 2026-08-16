"use client";

import { useState, useTransition } from "react";
import {
  downloadInvoicesAction,
  downloadOneInvoiceAction,
  type Download,
} from "@/app/(shop)/account/reports/downloads";

/** Turns what the server built into a file the browser saves. */
function save(download: Download) {
  const bytes = Uint8Array.from(atob(download.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = download.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Everything in the period, in one spreadsheet.
 *
 * The button says how many it will contain, because "download invoices" with
 * no number attached is a button people press twice.
 */
export function BulkInvoiceDownload({
  period,
  count,
}: {
  period: { key: string; from: string; to: string };
  count: number;
}) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={busy || count === 0}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await downloadInvoicesAction(period);
            if ("error" in result) setError(result.error);
            else save(result);
          })
        }
        className="h-10 rounded-card bg-brand px-5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-60"
      >
        {busy
          ? "Preparing…"
          : count === 0
            ? "Nothing to download"
            : `Download all ${count} invoice${count === 1 ? "" : "s"}`}
      </button>

      {error && (
        <span role="alert" className="text-sm font-semibold text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

/** One invoice, as a spreadsheet, from the list. */
export function OneInvoiceDownload({ reference }: { reference: string }) {
  const [busy, start] = useTransition();

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const result = await downloadOneInvoiceAction(reference);
          if (!("error" in result)) save(result);
        })
      }
      className="text-xs font-bold text-navy transition-colors hover:underline disabled:opacity-60"
      title="Download this invoice as a spreadsheet"
    >
      {busy ? "…" : "Spreadsheet"}
    </button>
  );
}
