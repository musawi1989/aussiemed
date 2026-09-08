"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState } from "react";
import { resetPermissionsAction } from "@/app/admin/roles/actions";
import type { FormState } from "@/components/AdminForm";

/**
 * Back to how it shipped.
 *
 * Asks first, because it undoes every change on the screen at once and there
 * is no per-permission history to walk back through afterwards. It is not
 * destructive in the way a delete is — nothing is lost but the settings
 * themselves — so it confirms rather than requiring anything typed.
 */
export function ResetPermissions({ changed }: { changed: number }) {
  const [state, submit, saving] = useActionState<FormState, FormData>(
    resetPermissionsAction,
    null
  );

  return (
    <RestoringForm state={state} saveAll={false}
      action={submit}
      onSubmit={(event) => {
        if (
          !confirm(
            `Put all ${changed} changed ${changed === 1 ? "permission" : "permissions"} back to how the system shipped?`
          )
        ) {
          event.preventDefault();
        }
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <button
        type="submit"
        disabled={saving || changed === 0}
        title={
          changed === 0
            ? "Nothing has been changed from how it shipped."
            : undefined
        }
        className="cursor-pointer rounded-card border border-border-strong bg-surface px-3 py-1.5 text-sm font-bold text-text transition-colors hover:border-navy hover:text-navy disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Putting back…" : "Put everything back as it shipped"}
      </button>

      {state?.ok === true && (
        <span role="status" className="text-xs font-semibold text-success">
          {state.message}
        </span>
      )}
      {state?.ok === false && (
        <span role="alert" className="text-xs font-semibold text-danger">
          {state.error}
        </span>
      )}
    </RestoringForm>
  );
}
