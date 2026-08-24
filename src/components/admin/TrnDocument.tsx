"use client";

import { useActionState } from "react";
import {
  removeTrnDocumentAction,
  uploadTrnDocumentAction,
} from "@/app/admin/trn-documents/actions";
import type { FormState } from "@/components/AdminForm";

/**
 * The TRN certificate on a supplier or a customer account.
 *
 * Its own panel rather than a field inside the main form, for two reasons. A
 * file input inside a form that is mostly text means re-choosing the file
 * every time somebody corrects a phone number. And there is nothing to attach
 * a document to until the record exists, so this appears only when editing —
 * the same shape as ProductImages, and for the same reason.
 *
 * Upload and Remove are separate forms with separate action state, so a
 * refusal lands against the thing that was refused and a mis-click cannot
 * delete something somebody meant to replace.
 */
export function TrnDocument({
  kind,
  id,
  document,
  maxMb,
  accepted,
}: {
  kind: "supplier" | "customer";
  id: string;
  document: { name: string; uploadedAt: Date } | null;
  maxMb: number;
  accepted: string;
}) {
  const [uploadState, upload, uploading] = useActionState<FormState, FormData>(
    uploadTrnDocumentAction,
    null,
  );
  const [removeState, remove, removing] = useActionState<FormState, FormData>(
    removeTrnDocumentAction,
    null,
  );

  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const hidden = (
    <>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
    </>
  );

  return (
    <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
      <h2 className="text-base font-bold tracking-tight text-text">
        TRN certificate
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        The document the number came from, so it can be checked rather than
        taken on trust. {accepted}, up to {maxMb} MB.
      </p>

      {document ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-card border border-border-base bg-surface-sunken px-3 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card border border-border-base bg-surface text-[10px] font-bold uppercase text-text-subtle">
            {document.name.split(".").pop()?.slice(0, 4) ?? "file"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-text">
              {document.name}
            </span>
            <span className="block text-xs text-text-subtle">
              Uploaded {day.format(document.uploadedAt)}
            </span>
          </span>

          {/* A normal link, not a fetch: the route sets Content-Disposition
              and the browser does the rest. It is admin-only on the server,
              so nothing here is what keeps it private. */}
          <a
            href={`/admin/trn-documents/${kind}/${id}`}
            className="shrink-0 cursor-pointer rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text transition-colors hover:border-navy hover:text-navy"
          >
            View
          </a>

          <form action={remove} className="shrink-0">
            {hidden}
            <button
              type="submit"
              disabled={removing}
              className="cursor-pointer rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:border-danger disabled:opacity-60"
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-3 rounded-card bg-surface-sunken px-3 py-3 text-sm text-text-muted">
          No certificate on file. The number can still be recorded without one
          &mdash; this is what lets somebody check it later.
        </p>
      )}

      <form action={upload} className="mt-3 flex flex-wrap items-end gap-2">
        {hidden}
        <label className="min-w-0 flex-1">
          <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
            {document ? "Replace it" : "Upload"}
          </span>
          <input
            type="file"
            name="document"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            className="mt-1 w-full cursor-pointer rounded-card border border-border-strong bg-surface px-3 py-1.5 text-sm text-text file:mr-3 file:cursor-pointer file:rounded-card file:border-0 file:bg-surface-sunken file:px-2 file:py-1 file:text-xs file:font-bold file:text-text"
          />
        </label>
        <button
          type="submit"
          disabled={uploading}
          className="cursor-pointer rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
        >
          {uploading ? "Uploading…" : document ? "Replace" : "Upload"}
        </button>
      </form>

      {/* The accept attribute above is a convenience in the file picker and
          nothing more — it is trivially bypassed, and the bytes are what
          decide. See document-file.ts. */}
      {[uploadState, removeState].map((state, index) =>
        state?.ok === false && state.error ? (
          <p
            key={index}
            role="alert"
            className="mt-2 text-xs font-semibold text-danger"
          >
            {state.error}
          </p>
        ) : state?.ok === true && state.message ? (
          <p
            key={index}
            role="status"
            className="mt-2 text-xs font-semibold text-success"
          >
            {state.message}
          </p>
        ) : null,
      )}
    </section>
  );
}
