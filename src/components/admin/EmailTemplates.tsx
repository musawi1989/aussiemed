"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useState } from "react";
import {
  createTemplateAction,
  deleteTemplateAction,
  updateTemplateAction,
} from "@/app/admin/emails/template-actions";
import type { FormState } from "@/components/AdminForm";
import { HtmlEditor } from "./HtmlEditor";

export type TemplateRow = {
  id: string;
  name: string;
  audience: "Customer" | "Supplier";
  subject: string;
  body: string;
  html?: string | null;
  needsOrder: boolean;
  updatedAt: string;
  updatedByName: string;
};

const field =
  "mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none";
const label = "block text-xs font-bold uppercase tracking-wide text-text-subtle";

/**
 * Templates written here, alongside the ones in the code.
 *
 * THE BUILT-IN ONES ARE NOT LISTED FOR EDITING and that is deliberate: they
 * are tested functions with a leak check over what they produce, and offering
 * an Edit that silently could not save would be worse than not offering one.
 * These are yours, and the compose picker shows both.
 */
export function EmailTemplates({
  templates,
  placeholders,
}: {
  templates: TemplateRow[];
  placeholders: Record<"Customer" | "Supplier", { key: string; note: string }[]>;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section className="mt-6 rounded-card border border-border-base bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold tracking-tight text-text">
          Your templates
        </h2>
        <p className="text-xs text-text-muted tnum">
          {templates.length} saved
        </p>
      </div>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-text-muted">
        Wording you reuse, ready in the picker above. The built-in templates
        stay where they are &mdash; these sit beside them.
      </p>

      {templates.length > 0 && (
        <ul className="mt-4 space-y-2">
          {templates.map((template) =>
            editing === template.id ? (
              <li key={template.id}>
                <TemplateForm
                  template={template}
                  placeholders={placeholders}
                  onDone={() => setEditing(null)}
                />
              </li>
            ) : (
              <li
                key={template.id}
                className="rounded-card border border-border-base bg-surface-sunken px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-bold text-text">
                    {template.name}
                    <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-text-muted">
                      {template.audience === "Customer" ? "Customers" : "Suppliers"}
                    </span>
                    {template.needsOrder && (
                      <span className="ml-1.5 text-[11px] font-semibold text-text-subtle">
                        needs an order
                      </span>
                    )}
                  </p>
                  <span className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditing(template.id)}
                      className="text-[11px] font-bold text-navy hover:underline"
                    >
                      Edit
                    </button>
                    <DeleteTemplate id={template.id} name={template.name} />
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-text-muted">
                  {template.subject}
                </p>
                <p className="mt-1 text-[11px] text-text-subtle tnum">
                  {template.updatedAt} by {template.updatedByName}
                </p>
              </li>
            )
          )}
        </ul>
      )}

      <div className="mt-4 border-t border-border-base pt-3">
        {adding ? (
          <TemplateForm
            placeholders={placeholders}
            onDone={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-card border border-border-strong bg-surface px-4 py-2 text-sm font-bold text-text transition-colors hover:border-navy hover:text-navy"
          >
            + New template
          </button>
        )}
      </div>
    </section>
  );
}

function TemplateForm({
  template,
  placeholders,
  onDone,
}: {
  template?: TemplateRow;
  placeholders: Record<"Customer" | "Supplier", { key: string; note: string }[]>;
  onDone: () => void;
}) {
  const [state, submit, saving] = useActionState<FormState, FormData>(
    template ? updateTemplateAction : createTemplateAction,
    null
  );
  // Held so the placeholder list below matches the audience being written for.
  const [audience, setAudience] = useState<"Customer" | "Supplier">(
    template?.audience ?? "Customer"
  );

  return (
    <RestoringForm state={state}
      action={submit}
      className="rounded-card border border-border-strong bg-surface-sunken p-4"
    >
      {template && <input type="hidden" name="id" value={template.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Name</span>
          <input
            name="name"
            required
            defaultValue={template?.name}
            placeholder="Delivery delayed"
            className={field}
          />
          <span className="mt-1 block text-[11px] text-text-subtle">
            What you will pick it by.
          </span>
        </label>

        <label className="block">
          <span className={label}>Who it is for</span>
          <select
            name="audience"
            value={audience}
            onChange={(e) =>
              setAudience(e.target.value === "Supplier" ? "Supplier" : "Customer")
            }
            className={field}
          >
            <option value="Customer">Customers</option>
            <option value="Supplier">Suppliers</option>
          </select>
          <span className="mt-1 block text-[11px] text-text-subtle">
            A customer template can never be sent to a supplier.
          </span>
        </label>
      </div>

      <label className="mt-3 block">
        <span className={label}>Subject</span>
        <input
          name="subject"
          required
          defaultValue={template?.subject}
          placeholder="Your order {{reference}}"
          className={field}
        />
      </label>

      <label className="mt-3 block">
        <span className={label}>Plain-text message</span>
        <textarea
          name="body"
          required
          rows={8}
          defaultValue={template?.body}
          placeholder={"Dear {{contactName}},\n\nYour order {{reference}} is on its way with {{courier}}.\n\n{{itemsShipped}}"}
          className={`${field} font-mono text-[13px]`}
        />
      </label>

      <HtmlEditor defaultValue={template?.html} />
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-text">
        <input type="hidden" name="needsOrder" value="0" />
        <input
          type="checkbox"
          name="needsOrder"
          value="1"
          defaultChecked={template?.needsOrder}
          className="cursor-pointer"
        />
        It refers to an order &mdash; ask for one before drafting
      </label>

      {/* The keys, beside the box rather than in a help page. Somebody writing
          a template needs to know what they can put in it at the moment they
          are writing it. */}
      <div className="mt-3 rounded-card border border-border-base bg-surface p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-text-subtle">
          What you can drop in
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {placeholders[audience].map((p) => (
            <span
              key={p.key}
              title={p.note}
              className="cursor-help rounded-full border border-border-base bg-surface-sunken px-2 py-0.5 font-mono text-[11px] text-text-muted"
            >
              {`{{${p.key}}}`}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-text-subtle">
          Anything else is left exactly as typed, so a mistake is visible rather
          than a silent gap. Empty ones disappear.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="h-9 rounded-card bg-navy px-4 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
        >
          {saving ? "Saving…" : template ? "Save changes" : "Create template"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-9 rounded-card border border-border-strong bg-surface px-4 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
        >
          {state?.ok === true ? "Close" : "Cancel"}
        </button>
        {state?.ok === false && (
          <span role="alert" className="text-xs font-semibold text-danger">
            {state.error}
          </span>
        )}
        {state?.ok === true && (
          <span role="status" className="text-xs font-semibold text-success">
            {state.message}
          </span>
        )}
      </div>
    </RestoringForm>
  );
}

/**
 * Deleted outright.
 *
 * A template is wording for the next email, not a record of one — what
 * actually went out has its own copy of the words on the email itself. It
 * still asks, because somebody spent time writing it.
 */
function DeleteTemplate({ id, name }: { id: string; name: string }) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    deleteTemplateAction,
    null
  );

  return (
    <RestoringForm state={state} saveAll={false} action={submit} className="inline">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        onClick={(event) => {
          if (
            !window.confirm(
              `Delete the template "${name}"?\n\nEmails already sent from it are unaffected.`
            )
          ) {
            event.preventDefault();
          }
        }}
        className="text-[11px] font-bold text-danger hover:underline disabled:opacity-60"
      >
        {pending ? "…" : "Delete"}
      </button>
      {state?.ok === false && (
        <span role="alert" className="ml-1 text-[11px] text-danger">
          {state.error}
        </span>
      )}
    </RestoringForm>
  );
}
