"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import {
  supplyTemplateAction,
  uploadSuppliesAction,
  type UploadState,
} from "@/app/business-portal/supplies/upload/actions";

/**
 * Download what we hold, change it, send it back.
 *
 * The template is pre-filled rather than blank: a supplier asked to type forty
 * item codes will get one wrong, and a row whose code does not match is a row
 * that cannot be applied. It also doubles as a statement of what we believe
 * their prices are, which is worth checking on its own.
 */
export function SupplyUpload({ itemCount }: { itemCount: number }) {
  const [state, submit, pending] = useActionState<UploadState, FormData>(
    uploadSuppliesAction,
    null
  );
  const [downloading, startDownload] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);

  const download = () =>
    startDownload(async () => {
      const { fileName: name, base64 } = await supplyTemplateAction();
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    });

  return (
    <div className="space-y-5">
      <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight text-text">
          1. Get your current list
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-text-muted tnum">
          A spreadsheet of the {itemCount} item{itemCount === 1 ? "" : "s"} we
          can order from you, already filled in with what we hold. Change what
          has moved and leave the rest.
        </p>
        <button
          type="button"
          onClick={download}
          disabled={downloading || itemCount === 0}
          className="mt-3 h-10 rounded-card bg-navy px-5 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
        >
          {downloading ? "Preparing…" : "Download my price list"}
        </button>
      </section>

      <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight text-text">
          2. Send it back
        </h2>

        <form action={submit} className="mt-3 space-y-3">
          <input
            type="file"
            name="file"
            required
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="block w-full text-sm text-text file:mr-3 file:rounded-card file:border file:border-border-strong file:bg-surface file:px-4 file:py-2 file:text-sm file:font-bold file:text-text hover:file:bg-surface-hover"
          />
          {fileName && (
            <p className="text-xs text-text-subtle">Chosen: {fileName}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-card bg-red px-5 text-sm font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
          >
            {pending ? "Reading it…" : "Upload"}
          </button>
        </form>

        {state?.ok === false && (
          <p
            role="alert"
            className="mt-3 rounded-card border-l-4 border-danger bg-danger-soft px-4 py-2.5 text-sm font-semibold text-danger"
          >
            {state.error}
          </p>
        )}

        {state?.ok === true && (
          <div className="mt-4 space-y-3">
            <p
              role="status"
              className="rounded-card border-l-4 border-success bg-success-soft px-4 py-2.5 text-sm font-semibold text-text tnum"
            >
              {state.updated} item{state.updated === 1 ? "" : "s"} updated.
            </p>

            {/* Every rejected row, with its spreadsheet row number. Fixing a
                fifty-line file one error per upload is how a tool like this
                ends up unused. */}
            {state.problems.length > 0 && (
              <div className="rounded-card border border-accent-border bg-accent-soft p-4">
                <p className="text-sm font-bold text-text tnum">
                  {state.problems.length} row
                  {state.problems.length === 1 ? "" : "s"} could not be read and{" "}
                  {state.problems.length === 1 ? "was" : "were"} left unchanged
                </p>
                <ul className="mt-2 space-y-1 text-sm text-text">
                  {state.problems.map((problem) => (
                    <li key={`${problem.rowNumber}-${problem.column}`}>
                      <span className="font-bold tnum">Row {problem.rowNumber}</span>
                      {", "}
                      <span className="font-semibold">{problem.column}</span>:{" "}
                      {problem.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {state.notSupplied.length > 0 && (
              <div className="rounded-card border border-border-strong bg-surface-sunken p-4">
                <p className="text-sm font-bold text-text tnum">
                  {state.notSupplied.length}{" "}
                  {state.notSupplied.length === 1 ? "item is" : "items are"} not
                  set up against your account
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  Nothing was changed for{" "}
                  <span className="tnum">{state.notSupplied.join(", ")}</span>.
                  Which items each supplier covers is decided by AussieMed — if
                  you should be supplying{" "}
                  {state.notSupplied.length === 1 ? "it" : "them"}, tell us and
                  we will set{" "}
                  {state.notSupplied.length === 1 ? "it" : "them"} up.
                </p>
              </div>
            )}

            <Link
              href="/business-portal/supplies"
              className="inline-block text-sm font-bold text-navy hover:underline"
            >
              Back to what you supply &rarr;
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
