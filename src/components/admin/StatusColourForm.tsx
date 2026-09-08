"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState } from "react";
import { setToneColourAction } from "@/app/admin/settings/actions";
import { StatusPill } from "@/components/StatusPill";
import type { FormState } from "@/components/AdminForm";
import type { ToneColour } from "@/lib/tone-colours";

/**
 * The five status colours, changeable.
 *
 * One form per colour rather than one for all five: a person changes one at a
 * time and wants to see the result, and a single Save covering five pickers
 * means five changes go live together with no way to tell which was wrong.
 *
 * Each row shows a live pill in that tone. A colour picker on its own tells you
 * what you chose; the pill tells you what it will look like on the orders list,
 * which is the thing actually being decided.
 *
 * What cannot be changed here is which status is which tone. That mapping is
 * the meaning — amber means somebody must act — and making it editable would
 * let an overdue invoice be turned green. That is not a preference, it is a way
 * to hide a problem.
 */
export function StatusColourForm({ colours }: { colours: ToneColour[] }) {
  return (
    <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
      <h2 className="text-base font-bold tracking-tight text-text">
        Status colours
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        The five tones used by every status pill, progress bar and rail on the
        site. Changing one here changes it everywhere at once. Which status gets
        which tone is fixed — that is what the colours mean.
      </p>

      <ul className="mt-4 space-y-3">
        {colours.map((colour) => (
          <ColourRow key={colour.tone} colour={colour} />
        ))}
      </ul>

      <p className="mt-4 border-t border-border-base pt-3 text-xs leading-relaxed text-text-subtle">
        A colour you choose is used in both light and dark. Clear the box and
        save to go back to the theme&rsquo;s own, which has a dark variant. The
        pale background behind each pill is worked out from the colour you pick,
        so the two cannot end up unreadable together.
      </p>
    </section>
  );
}

function ColourRow({ colour }: { colour: ToneColour }) {
  const [state, submit, saving] = useActionState<FormState, FormData>(
    setToneColourAction,
    null
  );

  return (
    <li className="rounded-card border border-border-base bg-surface-sunken p-3">
      <RestoringForm state={state} saveAll={true} action={submit} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="tone" value={colour.tone} />

        {/* The pill, not a swatch: this is what the choice actually produces. */}
        <span className="w-32 shrink-0">
          <StatusPill status={colour.label} axis="record" />
        </span>

        <input
          type="color"
          name="colour"
          defaultValue={colour.chosen ?? colour.fallback}
          aria-label={`Colour for ${colour.label}`}
          className="h-9 w-14 shrink-0 cursor-pointer rounded-card border border-border-strong bg-surface"
        />

        <span className="min-w-0 flex-1 text-xs text-text-muted">
          {colour.meaning}
          {colour.chosen === null && (
            <span className="ml-1 text-text-subtle">(theme default)</span>
          )}
        </span>

        <button
          type="submit"
          disabled={saving}
          className="h-9 shrink-0 rounded-card bg-navy px-3 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>

        {colour.chosen !== null && (
          <button
            type="submit"
            name="colour"
            value=""
            disabled={saving}
            className="h-9 shrink-0 text-xs font-bold text-text-muted hover:text-navy disabled:opacity-60"
          >
            Reset
          </button>
        )}

        {state?.ok === false && state.error && (
          <span role="alert" className="text-xs font-semibold text-danger">
            {state.error}
          </span>
        )}
        {state?.ok === true && (
          <span role="status" className="text-xs font-semibold text-success">
            {state.message}
          </span>
        )}
      </RestoringForm>
    </li>
  );
}
