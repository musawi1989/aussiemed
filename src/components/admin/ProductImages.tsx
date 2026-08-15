"use client";

import Image from "next/image";
import { useActionState } from "react";
import {
  makePrimaryImageAction,
  removeImageAction,
  uploadImageAction,
} from "@/app/admin/products/[id]/actions";
import type { FormState } from "@/components/AdminForm";

/**
 * Product photography — BE-29.
 *
 * The first image is the one the storefront shows, so it is labelled as such
 * rather than left as an ordering the admin has to infer. Removal and
 * promotion are separate one-button forms rather than a single form with a
 * mode, because each posts a different intent and a mis-click should not be
 * able to delete something the person meant to promote.
 */
export type AdminImage = {
  id: string;
  path: string;
  altText: string | null;
};

export function ProductImages({
  productId,
  slug,
  productName,
  images,
  maxMb,
}: {
  productId: string;
  slug: string;
  productName: string;
  images: AdminImage[];
  maxMb: number;
}) {
  const [uploadState, upload, uploading] = useActionState(uploadImageAction, null);

  return (
    <div>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        The first image is the one the catalogue and search results show.
        JPEG, PNG, GIF, WebP or AVIF, up to {maxMb} MB.
      </p>

      {images.length === 0 ? (
        <p className="mt-3 rounded-card bg-surface-sunken px-3 py-4 text-sm text-text-muted">
          No image yet. The storefront shows a monogram tile in its place —
          acceptable in a grid, but on a trade catalogue a photograph is often
          how a buyer confirms they have the right item.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {images.map((image, index) => (
            <li
              key={image.id}
              className="flex items-start gap-3 rounded-card border border-border-base bg-surface p-2"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-card bg-surface-sunken">
                <Image
                  src={image.path}
                  alt={image.altText ?? productName}
                  fill
                  sizes="64px"
                  className="object-contain"
                />
              </div>

              <div className="min-w-0 flex-1">
                {index === 0 && (
                  <span className="inline-block rounded-full bg-navy-soft px-2 py-0.5 text-[11px] font-bold text-navy">
                    Shown in the catalogue
                  </span>
                )}
                <p className="mt-1 truncate text-xs text-text-muted" title={image.path}>
                  {image.path}
                </p>
                <p className="truncate text-[11px] text-text-subtle">
                  {image.altText ?? "No alt text"}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                {index > 0 && (
                  <ImageButton
                    action={makePrimaryImageAction}
                    productId={productId}
                    slug={slug}
                    imageId={image.id}
                    label="Make primary"
                    className="text-navy hover:underline"
                  />
                )}
                <ImageButton
                  action={removeImageAction}
                  productId={productId}
                  slug={slug}
                  imageId={image.id}
                  label="Remove"
                  className="text-danger hover:underline"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={upload} className="mt-4 border-t border-border-base pt-4">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="slug" value={slug} />

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-text">
            Add an image
          </span>
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
            required
            className="block w-full text-xs text-text-muted file:mr-3 file:rounded-card file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-on-navy hover:file:bg-navy-hover"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-bold text-text">
            Alt text
          </span>
          <input
            type="text"
            name="altText"
            placeholder={productName}
            className="h-9 w-full rounded-card border border-border-strong bg-surface px-2.5 text-xs text-text"
          />
          <span className="mt-1 block text-[11px] text-text-subtle">
            What the image shows, for screen readers and for search. Left blank,
            the product name is used.
          </span>
        </label>

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
      </form>
    </div>
  );
}

/** One button, one intent, its own pending state and its own error. */
function ImageButton({
  action,
  productId,
  slug,
  imageId,
  label,
  className,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  productId: string;
  slug: string;
  imageId: string;
  label: string;
  className: string;
}) {
  const [state, submit, pending] = useActionState(action, null);

  return (
    <form action={submit} className="text-right">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="imageId" value={imageId} />
      <button
        type="submit"
        disabled={pending}
        className={`text-[11px] font-bold disabled:opacity-60 ${className}`}
      >
        {pending ? "Working…" : label}
      </button>
      {state?.ok === false && state.error && (
        <p role="alert" className="mt-0.5 text-[11px] font-semibold text-danger">
          {state.error}
        </p>
      )}
    </form>
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
