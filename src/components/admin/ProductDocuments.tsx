"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState } from "react";
import {
  removeDocumentAction,
  uploadDocumentAction,
} from "@/app/admin/products/[id]/actions";
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABELS,
  documentKindLabel,
} from "@/lib/documents";
import type { FormState } from "@/components/AdminForm";
import { ConfirmSubmit } from "./ConfirmSubmit";

/**
 * Safety data sheets, specifications and certificates — DA-13.
 *
 * The sibling of ProductImages, and deliberately shaped like it: the same
 * append-only list, the same one-button-one-intent removal. What differs is
 * that a document carries a kind, because a buyer looking for an SDS before
 * they can accept a delivery is not browsing — they are looking for one
 * specific piece of paper, and the kind is what they scan for.
 *
 * The panel is shown for every product, including those with nothing on file,
 * because "no documents yet" is information an admin needs. The storefront
 * makes the opposite choice and hides the section entirely.
 */
export type AdminDocument = {
  id: string;
  label: string;
  path: string;
  kind: string;
};

export function ProductDocuments({
  productId,
  slug,
  documents,
  maxMb,
  accepted,
}: {
  productId: string;
  slug: string;
  documents: AdminDocument[];
  maxMb: number;
  accepted: string;
}) {
  const [uploadState, upload, uploading] = useActionState(
    uploadDocumentAction,
    null
  );

  return (
    <div>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        Sheets a buyer can download from the product page. {accepted}, up to{" "}
        {maxMb} MB. For laboratory and medical buyers an SDS is often a
        condition of purchase, not a nicety.
      </p>

      {documents.length === 0 ? (
        <p className="mt-3 rounded-card bg-surface-sunken px-3 py-4 text-sm text-text-muted">
          Nothing on file. The Documents section does not appear on the product
          page until something is added here.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-start gap-3 rounded-card border border-border-base bg-surface p-2"
            >
              <span className="mt-0.5 shrink-0 rounded-full bg-navy-soft px-2 py-0.5 text-[11px] font-bold text-navy">
                {documentKindLabel(doc.kind)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">
                  {doc.label}
                </p>
                {/* The real link, so an admin can confirm the file opens
                    before a buyer is the one to discover it does not. */}
                <a
                  href={doc.path}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-[11px] text-navy hover:underline"
                  title={doc.path}
                >
                  {doc.path}
                </a>
              </div>

              <DocumentButton
                productId={productId}
                slug={slug}
                documentId={doc.id}
                label={doc.label}
              />
            </li>
          ))}
        </ul>
      )}

      <RestoringForm state={uploadState} saveAll={true} action={upload} className="mt-4 border-t border-border-base pt-4">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="slug" value={slug} />

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-text">
            Add a document
          </span>
          <input
            type="file"
            name="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            required
            className="block w-full text-xs text-text-muted file:mr-3 file:rounded-card file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-on-navy hover:file:bg-navy-hover"
          />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-text">Kind</span>
            <select
              name="kind"
              defaultValue="SDS"
              className="h-9 w-full rounded-card border border-border-strong bg-surface px-2 text-xs font-semibold text-text"
            >
              {DOCUMENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {DOCUMENT_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-text">Name</span>
            <input
              type="text"
              name="label"
              placeholder="Safety data sheet"
              className="h-9 w-full rounded-card border border-border-strong bg-surface px-2.5 text-xs text-text"
            />
          </label>
        </div>
        <span className="mt-1 block text-[11px] text-text-subtle">
          What the buyer sees as the link. Left blank, the file&rsquo;s own name
          is used.
        </span>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={uploading}
            className="rounded-card bg-red px-4 py-2 text-xs font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <Feedback state={uploadState} />
        </div>
      </RestoringForm>
    </div>
  );
}

/** Its own form, so a failed removal reports next to the row it failed on. */
function DocumentButton({
  productId,
  slug,
  documentId,
  label,
}: {
  productId: string;
  slug: string;
  documentId: string;
  /** Named in the confirmation, so it is obvious which row is going. */
  label: string;
}) {
  const [state, submit, pending] = useActionState(removeDocumentAction, null);

  return (
    <RestoringForm state={state} saveAll={false} action={submit} className="shrink-0 text-right">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="documentId" value={documentId} />
      <ConfirmSubmit
        what={`“${label}”`}
        consequence="The file is deleted and buyers lose the download from the product page."
        pending={pending}
        className="text-[11px] font-bold text-danger hover:underline disabled:opacity-60"
      />
      {state?.ok === false && state.error && (
        <p role="alert" className="mt-0.5 text-[11px] font-semibold text-danger">
          {state.error}
        </p>
      )}
    </RestoringForm>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state?.ok === false && state.error) {
    return (
      <p role="alert" className="text-xs font-semibold text-danger">
        {state.error}
      </p>
    );
  }
  if (state?.ok === true) {
    return (
      <p role="status" className="text-xs font-semibold text-success">
        {state.message ?? "Saved."}
      </p>
    );
  }
  return null;
}
