"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useState } from "react";
import {
  deleteMessageTemplateAction,
  saveMessageTemplateAction,
} from "@/app/admin/emails/message-actions";
import type { FormState } from "@/components/AdminForm";
import { HtmlEditor } from "./HtmlEditor";

type Row = {
  kind: string;
  label: string;
  audience: string;
  sample: { subject: string; body: string } | null;
  placeholders: string[];
  overridable: boolean;
  template: {
    subject: string;
    body: string;
    html?: string | null;
    isActive: boolean;
    updatedOn: string;
    updatedByName: string;
  } | null;
};

/**
 * Rewriting one of the automatic emails.
 *
 * THREE THINGS A PERSON NEEDS before they can write one of these, and the
 * screen shows all three: what the message currently says, what values it can
 * fill in, and what their version does to it. Without the first, somebody is
 * rewriting a message they have never seen; without the second, they are
 * guessing at placeholder names; without the third, they find out on a
 * customer.
 *
 * UNKNOWN PLACEHOLDERS ARE A NOTE, NOT A REFUSAL. The client asked for no
 * guards (DEC-40), so {{totl}} saves happily — it just prints as {{totl}} in
 * somebody's inbox. Saying so at the moment of typing is help; refusing the
 * save would be the guard that was explicitly not wanted.
 */
export function MessageTemplateEditor({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(saveMessageTemplateAction, null);
  const [removeState, remove, removing] = useActionState(
    deleteMessageTemplateAction,
    null
  );

  const [subject, setSubject] = useState(
    row.template?.subject ?? row.sample?.subject ?? ""
  );
  const [body, setBody] = useState(row.template?.body ?? row.sample?.body ?? "");

  const used = [...`${subject}\n${body}`.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g)]
    .map((m) => m[1]);
  const unknown = [...new Set(used)].filter((name) => !row.placeholders.includes(name));

  return (
    <li className="rounded-card border border-border-base bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">
            {row.label}
            <span className="ml-2 rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
              {row.audience}
            </span>
            {row.template?.isActive && (
              <span className="ml-1.5 rounded-full bg-navy-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy">
                your wording
              </span>
            )}
            {row.template && !row.template.isActive && (
              <span className="ml-1.5 rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-subtle">
                yours, switched off
              </span>
            )}
          </p>
          {row.template ? (
            <p className="mt-0.5 text-xs text-text-muted">
              Last edited by {row.template.updatedByName} on {row.template.updatedOn}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-text-muted">
              Using the built-in wording.
            </p>
          )}
        </div>

        {row.overridable ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text transition-colors hover:bg-surface-hover"
          >
            {open ? "Close" : row.template ? "Edit" : "Write your own"}
          </button>
        ) : (
          /* Said plainly rather than shown as a disabled button nobody can
             explain. This message is composed by a person each time, so there
             is no automatic wording to rewrite. */
          <span className="shrink-0 text-xs italic text-text-subtle">
            Written by hand each time — nothing to rewrite
          </span>
        )}
      </div>

      {!open && row.sample && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-navy hover:underline">
            What it says now
          </summary>
          <p className="mt-1.5 text-xs font-bold text-text">{row.sample.subject}</p>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-card bg-surface-sunken px-3 py-2 font-mono text-[11px] leading-relaxed text-text-muted">
            {row.sample.body}
          </pre>
        </details>
      )}

      {open && (
        <>
          <RestoringForm state={state} saveAll={true} action={submit} className="mt-3">
            <input type="hidden" name="kind" value={row.kind} />

            <p className="rounded-card border-l-4 border-accent-border bg-accent-soft px-3 py-2 text-xs text-text">
              <span className="font-bold">This goes out exactly as written.</span>{" "}
              Nothing checks it — not that a customer message avoids naming a
              supplier, not that the placeholders exist, not that it still says
              what the email is for. Deleting it puts the original back.
            </p>

            <label className="mt-3 block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                Subject
              </span>
              <input
                name="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-card border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-text focus:border-navy focus:outline-none"
              />
            </label>

            <label className="mt-2 block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                Message
              </span>
              <textarea
                name="body"
                rows={16}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full rounded-card border border-border-strong bg-surface px-2.5 py-2 font-mono text-xs leading-relaxed text-text focus:border-navy focus:outline-none"
              />
            </label>

            <HtmlEditor defaultValue={row.template?.html} />
            {/* The placeholder list is the reference somebody works from, so it
                sits under the box they are typing in rather than behind a
                link. Clicking one inserts it — retyping {{trackingNumber}} by
                hand is how {{trackingnumber}} gets into an email. */}
            <div className="mt-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                What this message can fill in
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {row.placeholders.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setBody((b) => `${b}{{${name}}}`)}
                    title={`Add {{${name}}} to the message`}
                    className="rounded-card bg-surface-sunken px-2 py-0.5 font-mono text-[11px] text-text-muted transition-colors hover:bg-navy-soft hover:text-navy"
                  >
                    {`{{${name}}}`}
                  </button>
                ))}
              </div>
            </div>

            {unknown.length > 0 && (
              <p className="mt-2 text-xs font-semibold text-accent">
                {unknown.map((n) => `{{${n}}}`).join(", ")}{" "}
                {unknown.length === 1 ? "is not something" : "are not things"} this
                message can fill in — it will print as written. Saving anyway is
                allowed.
              </p>
            )}

            <label className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={row.template?.isActive ?? true}
                className="mt-0.5 h-4 w-4 shrink-0 accent-navy"
              />
              <span className="text-xs text-text">
                <span className="font-bold">Send this instead of the built-in</span>
                <span className="block text-[11px] text-text-subtle">
                  Off keeps your draft without using it, so wording somebody
                  spent an afternoon on survives being reverted for a week.
                </span>
              </span>
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={pending}
                className="rounded-card bg-navy px-3 py-1.5 text-xs font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save this wording"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs font-bold text-text-muted hover:underline"
              >
                Cancel
              </button>
              <Feedback state={state} />
            </div>
          </RestoringForm>

          {/* A sibling of the form above, never nested inside it: a form in a
              form is invalid HTML and the browser drops the inner one, so the
              button would have saved rather than deleted. */}
          {row.template && (
            <RestoringForm state={removeState} saveAll={false} action={remove} onSubmit={event => { if (!window.confirm("Delete this template and restore the built-in wording?")) event.preventDefault(); }} className="mt-3 border-t border-border-base pt-2">
              <input type="hidden" name="kind" value={row.kind} />
              <button
                type="submit"
                disabled={removing}
                className="text-xs font-bold text-danger hover:underline disabled:opacity-60"
              >
                {removing ? "Removing…" : "Delete and go back to the built-in wording"}
              </button>
              <Feedback state={removeState} />
            </RestoringForm>
          )}
        </>
      )}
    </li>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state?.ok === false && state.error) {
    return (
      <p role="alert" className="mt-1 text-xs font-semibold text-danger">
        {state.error}
      </p>
    );
  }
  if (state?.ok === true) {
    return (
      <p role="status" className="mt-1 text-xs font-semibold text-success">
        {state.message ?? "Saved."}
      </p>
    );
  }
  return null;
}
