"use client";

import { useActionState } from "react";
import {
  uploadCatalogueAction,
  type ImportState,
} from "@/app/admin/products/upload/actions";

/**
 * Uploading a filled-in catalogue template — BE-04.
 *
 * The result matters as much as the upload. An import that says "48 of 60
 * loaded" without saying which twelve is worse than one that refuses outright,
 * so every rejected row is listed with its row number, its column and what is
 * wrong with it — the numbers matching what the person sees in their own
 * spreadsheet.
 */
export function CatalogueUpload() {
  const [state, upload, pending] = useActionState<ImportState, FormData>(
    uploadCatalogueAction,
    null
  );

  return (
    <div>
      <form action={upload}>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-text">
            Filled-in template
          </span>
          <input
            type="file"
            name="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="block w-full text-sm text-text-muted file:mr-3 file:rounded-card file:border-0 file:bg-navy file:px-4 file:py-2 file:text-sm file:font-bold file:text-on-navy hover:file:bg-navy-hover"
          />
          <span className="mt-1 block text-xs text-text-subtle">
            .xlsx only. A .csv is refused, because a comma inside a category
            name would shift every column after it.
          </span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="mt-4 rounded-card bg-red px-5 py-2.5 text-sm font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
        >
          {pending ? "Loading…" : "Load catalogue"}
        </button>
      </form>

      {state?.ok === false && (
        <p
          role="alert"
          className="mt-4 rounded-card border-l-4 border-danger bg-danger-soft px-4 py-3 text-sm font-semibold text-danger"
        >
          {state.error}
        </p>
      )}

      {state?.ok === true && (
        <div className="mt-4">
          <p
            role="status"
            className={`rounded-card border-l-4 px-4 py-3 text-sm font-semibold ${
              state.errors.length === 0
                ? "border-success bg-success-soft text-success"
                : "border-accent-border bg-accent-soft text-text"
            }`}
          >
            {state.message}
          </p>

          {state.errors.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-card border border-border-base">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-text-subtle">
                  <tr>
                    <th className="px-3 py-2 font-bold">Row</th>
                    <th className="px-3 py-2 font-bold">Column</th>
                    <th className="px-3 py-2 font-bold">What is wrong</th>
                  </tr>
                </thead>
                <tbody>
                  {state.errors.map((error, index) => (
                    <tr
                      key={`${error.rowNumber}-${error.column}-${index}`}
                      className="border-t border-border-base"
                    >
                      <td className="px-3 py-1.5 tnum font-bold text-text">
                        {error.rowNumber}
                      </td>
                      <td className="px-3 py-1.5 text-text-muted">{error.column}</td>
                      <td className="px-3 py-1.5 text-text">{error.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
