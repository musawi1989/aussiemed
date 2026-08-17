"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { StatusPill } from "@/components/StatusPill";
import { paymentStatusOf } from "@/lib/status-tone";
import { COLUMNS, type ColumnKey } from "@/lib/order-views";
import { bulkSetOrderStatus, exportOrdersCsv } from "@/app/admin/orders/bulk-actions";

/**
 * The orders table: selection, sorting, bulk actions and export.
 *
 * The rows are rendered server-side and handed here already formatted, so this
 * component never touches the database and never has to know how money or
 * dates are written. All it owns is what the user is pointing at.
 */

export type OrderRow = {
  reference: string;
  href: string;
  cells: Partial<Record<ColumnKey, string>>;
  status: string;
  paymentStatus: string;
  /** Shown as a bubble rather than a truncated cell, as in the reference UI. */
  customerNote: string | null;
  internalNote: string | null;
  /** Lines still waiting on stock — the thing a distributor chases. */
  backordered: number;
  /** Missing TRN means the tax invoice for this order is not compliant. */
  missingTrn: boolean;
};

export function OrdersTable({
  rows,
  columns,
  total,
  page,
  pageSize,
  pageCount,
  statuses,
}: {
  rows: OrderRow[];
  columns: ColumnKey[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  statuses: readonly string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string[]>([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const defs = columns
    .map((key) => COLUMNS.find((c) => c.key === key))
    .filter((c): c is (typeof COLUMNS)[number] => Boolean(c));

  const allOn = rows.length > 0 && selected.length === rows.length;

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    router.push(`/admin/orders?${next.toString()}`);
  };

  const sort = params.get("sort") ?? "created:desc";
  const [sortKey, sortDir] = sort.split(":");

  const toggleSort = (key: ColumnKey) => {
    // First click on a new column sorts descending, which is what anyone
    // wants from a date or a total; clicking the same one flips it.
    const dir = sortKey === key && sortDir === "desc" ? "asc" : "desc";
    setParam({ sort: `${key}:${dir}`, page: null });
  };

  const runBulk = (status: string) => {
    setStatusOpen(false);
    startTransition(async () => {
      const result = await bulkSetOrderStatus(selected, status);
      setSelected([]);
      setMessage(
        result.refused.length === 0
          ? `${result.changed} order${result.changed === 1 ? "" : "s"} moved to ${status}.`
          : `${result.changed} moved. ${result.refused.length} refused: ${result.refused
              .map((r) => `${r.reference} — ${r.why}`)
              .join("; ")}`
      );
      router.refresh();
    });
  };

  const download = () => {
    startTransition(async () => {
      const csv = await exportOrdersCsv(selected);
      // A blob URL keeps the export inside the authenticated session: there is
      // no public endpoint serving customer records to whoever finds it.
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `aussiemed-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(
        selected.length > 0
          ? `Exported ${selected.length} selected order${selected.length === 1 ? "" : "s"}.`
          : "Exported everything matching the current filters."
      );
    });
  };

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <button
            type="button"
            disabled={selected.length === 0 || pending}
            onClick={() => setStatusOpen((v) => !v)}
            className="rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-40"
          >
            Change status
            {selected.length > 0 && ` (${selected.length})`}
          </button>
          {statusOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-card border border-border-base bg-surface py-1 shadow-raised">
              {statuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => runBulk(status)}
                  className="block w-full px-4 py-2 text-left text-sm text-text transition-colors hover:bg-navy-soft"
                >
                  {status}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={download}
          disabled={pending}
          className="rounded-card border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:text-navy disabled:opacity-40"
        >
          Export CSV{selected.length > 0 ? ` (${selected.length})` : ""}
        </button>

        {message && (
          <p role="status" className="text-sm font-semibold text-text-muted">
            {message}
          </p>
        )}
      </div>

      <div className="mt-3 overflow-x-auto rounded-card border border-border-base bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border-base bg-surface-sunken text-left">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allOn}
                  aria-label="Select all orders on this page"
                  onChange={() =>
                    setSelected(allOn ? [] : rows.map((r) => r.reference))
                  }
                  className="h-4 w-4 accent-[var(--color-navy)]"
                />
              </th>
              {defs.map((column) => (
                <th
                  key={column.key}
                  className={`whitespace-nowrap px-4 py-2.5 font-bold text-text-subtle ${
                    column.numeric ? "text-right" : ""
                  }`}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className="inline-flex items-center gap-1 font-bold transition-colors hover:text-navy"
                    >
                      {column.label}
                      <span className="text-[10px]">
                        {sortKey === column.key
                          ? sortDir === "asc"
                            ? "▲"
                            : "▼"
                          : "⇅"}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr
                key={row.reference}
                className="border-b border-border-base last:border-0 hover:bg-surface-hover"
              >
                <td className="px-3 py-3 align-top">
                  <input
                    type="checkbox"
                    checked={selected.includes(row.reference)}
                    aria-label={`Select ${row.reference}`}
                    onChange={() =>
                      setSelected((s) =>
                        s.includes(row.reference)
                          ? s.filter((r) => r !== row.reference)
                          : [...s, row.reference]
                      )
                    }
                    className="h-4 w-4 accent-[var(--color-navy)]"
                  />
                </td>

                {defs.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 align-top ${
                      column.numeric ? "text-right tnum" : ""
                    } ${column.nowrap ? "whitespace-nowrap" : ""}`}
                  >
                    <Cell row={row} column={column.key} />
                  </td>
                ))}
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={defs.length + 1}
                  className="px-4 py-10 text-center text-text-muted"
                >
                  No orders match those filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Pages" className="flex flex-wrap items-center gap-1.5">
          {pageLinks(page, pageCount).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} className="px-1 text-text-subtle">
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => setParam({ page: String(n) })}
                aria-current={n === page ? "page" : undefined}
                className={`rounded-card px-3 py-1.5 text-sm font-bold tnum transition-colors ${
                  n === page
                    ? "bg-navy text-on-navy"
                    : "bg-surface text-text-muted hover:bg-surface-hover"
                }`}
              >
                {n}
              </button>
            )
          )}
        </nav>

        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span>Showing</span>
          <select
            value={pageSize}
            aria-label="Rows per page"
            onChange={(e) => setParam({ size: e.target.value, page: null })}
            className="rounded-card border border-border-strong bg-surface px-2 py-1 text-sm tnum text-text focus:border-navy focus:outline-none"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span className="tnum">of {total.toLocaleString("en-AE")} results</span>
        </div>
      </div>
    </>
  );
}

/** First, last and a window around the current page, as in the reference UI. */
function pageLinks(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const out: (number | null)[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pageCount - 1, page + 1);
  if (from > 2) out.push(null);
  for (let n = from; n <= to; n += 1) out.push(n);
  if (to < pageCount - 1) out.push(null);
  out.push(pageCount);
  return out;
}

function Cell({ row, column }: { row: OrderRow; column: ColumnKey }) {
  const value = row.cells[column];

  if (column === "id") {
    return (
      <div>
        <Link
          href={row.href}
          className="font-bold tnum text-navy hover:underline"
        >
          {value}
        </Link>
        {row.backordered > 0 && (
          <p className="mt-0.5 text-xs font-bold text-accent tnum">
            {row.backordered} on backorder
          </p>
        )}
      </div>
    );
  }

  if (column === "status") return <StatusPill axis="fulfilment" status={row.status} />;

  if (column === "paid") {
    return (
      <div>
        <StatusPill
          axis="payment"
          status={paymentStatusOf(row, new Date())}
        />
        {value && <p className="mt-0.5 text-xs tnum text-text-subtle">{value}</p>}
      </div>
    );
  }

  if (column === "trn") {
    return value ? (
      <span className="tnum text-text-muted">{value}</span>
    ) : (
      <span className="text-xs font-bold text-danger">missing</span>
    );
  }

  if (column === "customerNotes" || column === "internalNotes") {
    const note = column === "customerNotes" ? row.customerNote : row.internalNote;
    return note ? (
      <span className="block max-w-[16rem] rounded-card bg-surface-sunken px-2.5 py-1.5 text-xs leading-snug text-text">
        {note}
      </span>
    ) : (
      <span className="text-xs text-text-subtle">—</span>
    );
  }

  return <span className="text-text-muted">{value || "—"}</span>;
}
