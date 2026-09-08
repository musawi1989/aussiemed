"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useRef } from "react";
import { setPermissionAction } from "@/app/admin/roles/actions";
import type { FormState } from "@/components/AdminForm";
import {
  MODE_LABELS,
  MODE_NOTES,
  isChangedFromDefault,
  type PermissionDef,
  type PermissionMode,
} from "@/lib/permission-catalogue";

/**
 * One capability, and the three answers to it.
 *
 * SAVES ON CHOICE RATHER THAN ON A SAVE BUTTON. Ten permissions behind one
 * button is a screen where somebody changes two things, presses Save, and
 * cannot tell which of the two took — and where leaving the page silently
 * discards everything. One radio, one write, one message beside it.
 *
 * The consequence of the CURRENT setting is what gets shown, not a general
 * note about the capability. A warning about repricing means nothing while
 * prices still need approval, and shown then it teaches people to ignore it.
 */
export function PermissionRow({
  definition,
  mode,
  queue,
}: {
  definition: PermissionDef;
  mode: PermissionMode;
  /** A live count and where to deal with it, when this mode creates a queue. */
  queue?: { count: number; label: string; href: string };
}) {
  const [state, submit, saving] = useActionState<FormState, FormData>(
    setPermissionAction,
    null
  );
  const form = useRef<HTMLFormElement>(null);

  const changed = isChangedFromDefault(definition, mode);

  return (
    <div className="border-t border-border-base py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-[15rem] flex-1">
          <p className="text-sm font-bold text-text">
            {definition.label}
            {changed && (
              <span
                className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-text"
                title="This is not how the system shipped. The default is shown below."
              >
                Changed
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">{definition.note}</p>
        </div>

        <RestoringForm state={state} saveAll={false} ref={form} action={submit} className="flex flex-wrap gap-1.5">
          <input type="hidden" name="key" value={definition.key} />
          {definition.modes.map((option) => (
            <label
              key={option}
              title={MODE_NOTES[option]}
              className={`cursor-pointer rounded-card border px-2.5 py-1 text-xs font-bold transition-colors ${
                mode === option
                  ? option === "off"
                    ? "border-danger bg-danger text-white"
                    : "border-navy bg-navy text-on-navy"
                  : "border-border-strong bg-surface text-text hover:border-navy hover:text-navy"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={option}
                defaultChecked={mode === option}
                disabled={saving}
                onChange={() => form.current?.requestSubmit()}
                className="sr-only"
              />
              {MODE_LABELS[option]}
            </label>
          ))}
        </RestoringForm>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-text-subtle">{definition.where}</span>

        {changed && (
          <span className="text-text-subtle">
            Shipped as {MODE_LABELS[definition.default].toLowerCase()}.
          </span>
        )}

        {saving && <span className="font-semibold text-text-muted">Saving…</span>}
        {state?.ok === true && !saving && (
          <span role="status" className="font-semibold text-success">
            {state.message}
          </span>
        )}
        {state?.ok === false && (
          <span role="alert" className="font-semibold text-danger">
            {state.error}
          </span>
        )}
      </div>

      {/* Only where it is currently the case: a queue that exists because of
          this setting, with the number waiting in it and the way to it. */}
      {queue && mode === "approval" && (
        <p className="mt-2 rounded-card border-l-4 border-accent-border bg-accent-soft px-3 py-2 text-xs text-text">
          <span className="font-bold tnum">{queue.count}</span> {queue.label}{" "}
          <a href={queue.href} className="font-bold underline hover:no-underline">
            Deal with them
          </a>
        </p>
      )}

      {definition.warning && (
        <p className="mt-2 text-xs leading-relaxed text-text-subtle">
          {definition.warning}
        </p>
      )}
    </div>
  );
}
