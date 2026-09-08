"use client";
import { useId, useState } from "react";
import { useRestored } from "@/components/AdminForm";

export function HtmlEditor({ name = "html", label = "HTML message", defaultValue = "", value, onChange }: {
  name?: string; label?: string; defaultValue?: string | null; value?: string; onChange?: (value: string) => void;
}) {
  const restored = useRestored(name);
  const editorId = useId();
  const [local, setLocal] = useState(restored ?? defaultValue ?? "");
  const [preview, setPreview] = useState(false);
  const html = value ?? local;
  return <div className="mt-3 min-w-0">
    <div className="mb-2 flex items-center justify-between gap-2">
      <label htmlFor={editorId} className="text-xs font-bold text-text-muted">{label}</label>
      <div role="tablist" aria-label={`${label} view`} className="flex gap-1">
        {([false, true] as const).map(mode => <button key={String(mode)} type="button" role="tab" aria-selected={preview === mode}
          onClick={() => setPreview(mode)} className={`px-3 py-1 text-xs font-semibold ${preview === mode ? "border-b-2 border-navy text-navy" : "text-text-muted"}`}>{mode ? "Preview" : "HTML"}</button>)}
      </div>
    </div>
    <textarea id={editorId} name={name} value={html} rows={10} maxLength={100000} hidden={preview}
      onChange={event => { setLocal(event.target.value); onChange?.(event.target.value); }}
      className="w-full rounded-card border border-border-strong bg-surface px-3 py-2 font-mono text-xs text-text" />
    {preview && <iframe title={`${label} preview`} sandbox="" referrerPolicy="no-referrer"
      srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><body>${html}</body>`}
      className="h-72 w-full rounded-card border border-border-base bg-white" />}
  </div>;
}
