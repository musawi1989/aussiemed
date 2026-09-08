"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useState, useTransition } from "react";
import { draftAction, sendComposedAction } from "@/app/admin/emails/actions";
import type { RecipientOption } from "@/lib/compose";
import { HtmlEditor } from "./HtmlEditor";

type TemplateOption = {
  id: string;
  label: string;
  audience: "Customer" | "Supplier";
  needsOrder: boolean;
};

type OrderOption = { value: string; label: string; email: string | null };

const field =
  "h-10 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text";

/**
 * Writing an email from the back office.
 *
 * The three dropdowns are linked on purpose. Choosing a supplier switches the
 * template list to supplier wording and the order list to purchase orders,
 * because a template that filled a customer's name into a supplier's message
 * would be a leak the person sending it did not intend. Under DEC-24 a
 * supplier never learns a customer exists, and the safest way to hold that is
 * for the customer's details never to be reachable from this side of the form.
 *
 * The template only ever fills the boxes. What gets sent is what is in them
 * when Send is pressed, because a person has to be able to change their mind
 * about a sentence.
 */
export function ComposeEmail({
  customers,
  suppliers,
  templates,
  orders,
  purchaseOrders,
}: {
  customers: RecipientOption[];
  suppliers: RecipientOption[];
  templates: TemplateOption[];
  orders: OrderOption[];
  purchaseOrders: OrderOption[];
}) {
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<"Customer" | "Supplier">("Customer");
  const [to, setTo] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [reference, setReference] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [html, setHtml] = useState("");
  const [drafting, startDraft] = useTransition();
  const [draftError, setDraftError] = useState<string | null>(null);

  const [state, submit, sending] = useActionState(sendComposedAction, null);

  const forAudience = templates.filter((t) => t.audience === audience);
  const references = audience === "Customer" ? orders : purchaseOrders;
  const chosen = templates.find((t) => t.id === templateId) ?? null;

  const switchAudience = (next: "Customer" | "Supplier") => {
    setAudience(next);
    // Everything downstream belonged to the other side.
    setTo("");
    setTemplateId("");
    setReference("");
    setSubject("");
    setBody("");
    setHtml("");
    setDraftError(null);
  };

  const fill = (nextTemplate: string, nextReference: string) => {
    if (!nextTemplate) return;
    startDraft(async () => {
      setDraftError(null);
      const result = await draftAction({
        templateId: nextTemplate,
        reference: nextReference || null,
      });
      if ("error" in result) {
        setDraftError(result.error);
        return;
      }
      setSubject(result.subject);
      setBody(result.body);
      setHtml(result.html ?? "");
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 rounded-card bg-red px-5 text-sm font-bold text-on-red transition-colors hover:bg-red-hover"
      >
        Write an email
      </button>
    );
  }

  return (
    <RestoringForm state={state} saveAll={false}
      action={submit}
      className="rounded-card border border-border-strong bg-surface p-5 shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold tracking-tight text-text">
          Write an email
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-bold text-text-muted hover:text-text"
        >
          Close
        </button>
      </div>

      <input type="hidden" name="audience" value={audience} />

      {/* --- who it is for --- */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {(["Customer", "Supplier"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => switchAudience(option)}
            aria-pressed={audience === option}
            className={`rounded-card px-3 py-1.5 text-sm font-bold transition-colors ${
              audience === option
                ? "bg-navy text-on-navy"
                : "border border-border-strong bg-surface text-text-muted hover:text-navy"
            }`}
          >
            {option === "Customer" ? "To a customer" : "To a supplier"}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-text-muted">
            {audience === "Customer" ? "Customer" : "Supplier"}
          </span>
          <select
            name="to"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={field}
          >
            <option value="">Choose…</option>
            {(audience === "Customer" ? customers : suppliers).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-text-muted">
            {audience === "Customer" ? "Order" : "Purchase order"}
          </span>
          <select
            value={reference}
            onChange={(e) => {
              setReference(e.target.value);
              fill(templateId, e.target.value);
            }}
            className={field}
          >
            <option value="">
              {chosen?.needsOrder ? "Choose one…" : "None"}
            </option>
            {references.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-text-muted">
            Template
          </span>
          <select
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              fill(e.target.value, reference);
            }}
            className={field}
          >
            <option value="">Choose…</option>
            {forAudience.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {draftError && (
        <p className="mt-2 text-sm font-semibold text-accent">{draftError}</p>
      )}

      {/* --- the message --- */}
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-bold text-text-muted">Subject</span>
        <input
          name="subject"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={drafting ? "Filling in…" : "What it is about"}
          className={field}
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-bold text-text-muted">Plain-text message</span>
        <textarea
          name="body"
          required
          rows={14}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            drafting
              ? "Filling in…"
              : "Pick a template above, or write it yourself."
          }
          className="w-full rounded-card border border-border-strong bg-surface px-3 py-2 font-mono text-sm leading-relaxed text-text"
        />
      </label>

      <HtmlEditor value={html} onChange={setHtml} />
      <label className="mt-3 block text-xs font-semibold text-text-muted">Attachments
        <input key={audience} aria-label="Attach files" name="attachments" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx" className="mt-2 block w-full cursor-pointer rounded-card border border-border-strong bg-surface px-3 py-3 text-sm text-text file:mr-3 file:cursor-pointer file:rounded-card file:border-0 file:bg-navy file:px-4 file:py-2 file:text-sm file:font-bold file:text-on-navy hover:file:bg-navy-hover focus-visible:outline-2 focus-visible:outline-navy" />
      </label>
      <p className="mt-2 text-xs leading-relaxed text-text-subtle">
        {audience === "Supplier" && (
          <>
            {" "}
            A message to a supplier is checked before it goes: it must not name
            a customer, an account or an order reference.
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={sending || drafting}
          className="h-10 rounded-card bg-navy px-5 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send"}
        </button>

        {state?.ok === false && state.error && (
          <span role="alert" className="text-sm font-semibold text-danger">
            {state.error}
          </span>
        )}
        {state?.ok === true && (
          <span role="status" className="text-sm font-semibold text-success">
            {state.message}
          </span>
        )}
      </div>
    </RestoringForm>
  );
}
