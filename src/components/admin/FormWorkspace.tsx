"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type Entry = { baseline: string; dirty: boolean; busy: boolean; sawPending: boolean; finish?: (saved: boolean) => void };
function snapshot(form: HTMLFormElement) {
  return JSON.stringify([...new FormData(form)].filter(([key]) => !key.startsWith("$ACTION_")).map(([key, value]) =>
    [key, typeof value === "string" ? value : !value.name && !value.size ? "" : `${value.name}:${value.size}:${value.lastModified}`]));
}

export function FormWorkspace({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const forms = useRef(new Map<HTMLFormElement, Entry>());
  const bypass = useRef(false);
  const [dirty, setDirty] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [navigation, setNavigation] = useState<{ go: () => void } | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    bypass.current = false;
    const records = forms.current;
    const publish = () => setDirty([...records.values()].filter(entry => entry.dirty).length);
    const scan = () => {
      for (const [form, entry] of records) if (!element.contains(form)) {
        entry.finish?.(!entry.dirty); records.delete(form);
      }
      for (const form of element.querySelectorAll<HTMLFormElement>("form[data-managed-form]")) {
        const value = snapshot(form);
        let entry = records.get(form);
        if (!entry) { entry = { baseline: value, dirty: false, busy: false, sawPending: false }; records.set(form, entry); }
        const pending = form.querySelector<HTMLElement>("[data-form-pending]")?.dataset.formPending === "true";
        if (pending) { entry.busy = true; entry.sawPending = true; }
        if (entry.busy && entry.sawPending && !pending) {
          const saved = form.dataset.actionResult === "saved";
          if (saved) { entry.baseline = value; entry.dirty = false; }
          entry.busy = false; entry.sawPending = false;
          entry.finish?.(saved); entry.finish = undefined;
        } else if (!entry.busy) entry.dirty = value !== entry.baseline;
      }
      publish();
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ["value", "checked", "data-action-result", "data-form-pending"] });
    const changed = () => { setMessage(""); scan(); };
    element.addEventListener("input", changed); element.addEventListener("change", changed);
    const cancelled = (event: Event) => records.get(event.target as HTMLFormElement)?.finish?.(false);
    element.addEventListener("form-save-cancelled", cancelled);
    const warn = (event: BeforeUnloadEvent) => {
      if (!bypass.current && [...records.values()].some(entry => entry.dirty)) { event.preventDefault(); event.returnValue = ""; }
    };
    const click = (event: MouseEvent) => {
      if (bypass.current || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.download || (anchor.target && anchor.target !== "_self") || ![...records.values()].some(entry => entry.dirty)) return;
      const url = new URL(anchor.href, location.href);
      if (url.href === location.href || (url.pathname === location.pathname && url.search === location.search && url.hash)) return;
      event.preventDefault(); event.stopPropagation();
      setNavigation({ go: () => url.origin === location.origin ? router.push(url.pathname + url.search + url.hash) : location.assign(url.href) });
    };
    const nav = (window as Window & { navigation?: EventTarget & { currentEntry?: { index: number } } }).navigation;
    const traverse = (event: Event) => {
      const e = event as Event & { navigationType?: string; destination?: { index: number; url: string } };
      if (e.navigationType !== "traverse" || !e.cancelable || bypass.current || ![...records.values()].some(entry => entry.dirty)) return;
      const delta = (e.destination?.index ?? 0) - (nav?.currentEntry?.index ?? 0);
      if (!delta) return;
      e.preventDefault(); setNavigation({ go: () => history.go(delta) });
    };
    window.addEventListener("beforeunload", warn); document.addEventListener("click", click, true); nav?.addEventListener("navigate", traverse);
    return () => {
      observer.disconnect(); element.removeEventListener("input", changed); element.removeEventListener("change", changed);
      element.removeEventListener("form-save-cancelled", cancelled);
      window.removeEventListener("beforeunload", warn); document.removeEventListener("click", click, true); nav?.removeEventListener("navigate", traverse);
      for (const entry of records.values()) entry.finish?.(false);
      records.clear();
    };
  }, [pathname, router]);

  useEffect(() => {
    if (navigation && !dialog.current?.open) dialog.current?.showModal();
    if (!navigation) dialog.current?.close();
  }, [navigation]);

  const saveAll = async () => {
    setSaving(true); setMessage("");
    let success = true;
    for (const [form, entry] of forms.current) {
      if (!entry.dirty) continue;
      if (form.dataset.saveAll !== "true") { success = false; continue; }
      if (!form.checkValidity()) {
        dialog.current?.close();
        setNavigation(null);
        form.scrollIntoView({ block: "center", behavior: "smooth" });
        form.reportValidity();
        success = false; break;
      }
      form.dataset.workspaceSaving = "true";
      const saved = await new Promise<boolean>(resolve => {
        const timeout = setTimeout(() => { entry.finish = undefined; resolve(false); }, 60000);
        entry.finish = (value) => { clearTimeout(timeout); resolve(value); };
        if (!entry.busy) form.requestSubmit();
      });
      delete form.dataset.workspaceSaving;
      if (!saved) { success = false; dialog.current?.close(); setNavigation(null); form.scrollIntoView({ block: "center", behavior: "smooth" }); break; }
    }
    setSaving(false);
    setMessage(success ? "All changes saved." : "Some changes remain. Check the form messages; payments and email drafts need their own submit action.");
    return success;
  };
  const leave = () => {
    bypass.current = true;
    const go = navigation?.go;
    setNavigation(null); go?.();
  };
  return <div ref={root}>
    {children}
    {(dirty > 0 || message) && <div className="fixed bottom-3 right-3 z-40 flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-3 rounded-card border border-border-strong bg-surface px-4 py-3 shadow-card" aria-live="polite">
      <span className="text-xs text-text">{message || `${dirty} unsaved form${dirty === 1 ? "" : "s"}`}</span>
      {dirty > 0 && <button type="button" disabled={saving} onClick={() => void saveAll()} className="rounded-card bg-red px-4 py-2 text-xs font-bold text-on-red disabled:opacity-60">{saving ? "Saving..." : "Save all changes"}</button>}
      {dirty === 0 && <button type="button" onClick={() => setMessage("")} className="text-xs text-text-muted">Dismiss</button>}
    </div>}
    <dialog ref={dialog} onCancel={event => { event.preventDefault(); setNavigation(null); }} className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card border border-border-strong bg-surface p-6 text-text backdrop:bg-black/40">
      <h2 className="text-lg font-bold">Unsaved changes</h2>
      <p className="mt-2 text-sm">Save your changes before leaving this page?</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" disabled={saving} onClick={async () => { if (await saveAll()) leave(); }} className="rounded-card bg-red px-3 py-2 text-sm font-bold text-on-red">Save and leave</button>
        <button type="button" disabled={saving} onClick={leave} className="rounded-card border border-border-strong px-3 py-2 text-sm">Discard and leave</button>
        <button type="button" disabled={saving} onClick={() => setNavigation(null)} className="px-3 py-2 text-sm">Stay</button>
      </div>
      {message && <p role="status" className="mt-3 text-xs">{message}</p>}
    </dialog>
  </div>;
}
