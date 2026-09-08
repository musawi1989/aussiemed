"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  bulkSetProductStatus,
  exportProductsCsv,
} from "@/app/admin/products/bulk-actions";

/**
 * Selection and bulk actions for the products list.
 *
 * Three pieces rather than one table component, on purpose. The products table
 * is server-rendered and reads well as server JSX — rewriting it as a client
 * component to hold a set of ticked ids would drag the whole thing, and every
 * link and price format in it, into the browser for no gain. So the state
 * lives in a context, each row gets one small client checkbox, and the toolbar
 * reads the same context.
 *
 * The toolbar only appears once something is ticked. A bulk control sitting on
 * screen with nothing selected is a control that gets used by accident.
 */

type Selection = {
  selected: Set<string>;
  toggle: (id: string) => void;
  clear: () => void;
  /** Every id on this page, so "select all" knows what all means. */
  register: (ids: string[]) => void;
};

const SelectionContext = createContext<Selection | null>(null);

export function ProductSelectionProvider({
  ids,
  children,
}: {
  ids: string[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pageIds, setPageIds] = useState<string[]>(ids);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const value = useMemo<Selection>(
    () => ({
      selected,
      toggle,
      clear: () => setSelected(new Set()),
      register: setPageIds,
    }),
    [selected, toggle]
  );

  return (
    <SelectionContext.Provider value={value}>
      <BulkBar pageIds={pageIds} />
      {children}
    </SelectionContext.Provider>
  );
}

function useSelection(): Selection {
  const value = useContext(SelectionContext);
  if (!value) throw new Error("Product selection used outside its provider");
  return value;
}

/** One row's tick box. */
export function SelectProduct({ id, name }: { id: string; name: string }) {
  const { selected, toggle } = useSelection();

  return (
    <input
      type="checkbox"
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      aria-label={`Select ${name}`}
      className="cursor-pointer"
    />
  );
}

/** The header tick box: everything on this page, or nothing. */
export function SelectAllProducts({ ids }: { ids: string[] }) {
  const { selected, toggle, clear } = useSelection();
  const allOn = ids.length > 0 && ids.every((id) => selected.has(id));

  return (
    <input
      type="checkbox"
      checked={allOn}
      onChange={() => {
        if (allOn) clear();
        else ids.forEach((id) => !selected.has(id) && toggle(id));
      }}
      aria-label="Select every product on this page"
      className="cursor-pointer"
    />
  );
}

const STATUSES = ["Active", "Inactive", "Draft", "PendingApproval"] as const;

function BulkBar({ pageIds }: { pageIds: string[] }) {
  const { selected, clear } = useSelection();
  const [status, setStatus] = useState<string>("Active");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ids = [...selected];
  if (ids.length === 0) return null;

  const apply = () =>
    start(async () => {
      const { changed, refused } = await bulkSetProductStatus(ids, status);
      clear();
      // Refusals are named, not counted. "12 changed, 3 refused" leaves
      // somebody hunting for which three.
      setNote(
        refused.length === 0
          ? `${changed} product${changed === 1 ? "" : "s"} set to ${status}.`
          : `${changed} changed. ${refused.length} refused: ` +
            refused.slice(0, 3).map((r) => `${r.name} — ${r.why}`).join("; ") +
            (refused.length > 3 ? `, and ${refused.length - 3} more.` : "")
      );
    });

  const download = () =>
    start(async () => {
      const csv = await exportProductsCsv(ids);
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `aussiemed-products-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setNote(`Exported ${ids.length} product${ids.length === 1 ? "" : "s"}.`);
    });

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-card border border-navy-border bg-navy-soft px-3 py-2.5">
      <span className="text-sm font-bold text-navy tnum">
        {ids.length} selected
      </span>

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        aria-label="Status to set"
        className="h-8 rounded-card border border-border-strong bg-surface px-2 text-sm text-text"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s === "PendingApproval" ? "Pending approval" : s}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={apply}
        disabled={pending}
        className="h-8 rounded-card bg-navy px-3 text-sm font-bold text-on-navy disabled:opacity-60"
      >
        {pending ? "Working…" : "Set status"}
      </button>

      <button
        type="button"
        onClick={download}
        disabled={pending}
        className="h-8 rounded-card border border-border-strong bg-surface px-3 text-sm font-bold text-text disabled:opacity-60"
      >
        Export CSV
      </button>

      <button
        type="button"
        onClick={() => {
          clear();
          setNote(null);
        }}
        className="text-sm font-semibold text-text-muted hover:underline"
      >
        Clear
      </button>

      <span className="text-xs text-text-subtle">
        of {pageIds.length} on this page
      </span>

      {note && (
        <p role="status" className="w-full text-xs font-semibold text-navy">
          {note}
        </p>
      )}
    </div>
  );
}
