import { formatAED } from "@/lib/money";
import { barWidth, share } from "@/lib/reporting";

const aed = (fils: number) => formatAED(fils / 100);

/**
 * The pieces every report is built from.
 *
 * Shared so the customer and supplier reports read as one family, and so the
 * awkward cases are handled once: an empty period, a figure nobody can know
 * yet, and a total that quietly excludes something.
 */

export function ReportPanel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
      <h2 className="text-base font-bold tracking-tight text-text">{title}</h2>
      {hint && <p className="mt-1 text-sm text-text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <li className="rounded-card border border-border-base bg-surface p-4 shadow-card">
      <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tnum text-text">{value}</p>
      {note && <p className="mt-0.5 text-xs text-text-subtle">{note}</p>}
    </li>
  );
}

/** Says there is nothing rather than drawing an empty table. */
export function Nothing({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-card border border-dashed border-border-strong bg-surface-sunken px-4 py-8 text-center text-sm text-text-muted">
      {children}
    </p>
  );
}

export type BarRow = {
  key: string;
  label: string;
  value: number;
  /** Shown to the right of the bar. Defaults to the value as money. */
  display?: string;
  note?: string;
};

/**
 * A horizontal bar chart, in HTML rather than a charting library.
 *
 * Twelve bars and a label do not justify a dependency, and this prints,
 * scales, and reads in a screen reader — which a canvas does not. Bars are
 * scaled against the largest, so a long tail stays visible.
 */
export function Bars({
  rows,
  total,
  emptyLabel = "Nothing in this period",
}: {
  rows: BarRow[];
  /** When given, each row also shows its share of it. */
  total?: number;
  emptyLabel?: string;
}) {
  const max = rows.reduce((n, row) => Math.max(n, row.value), 0);

  if (rows.length === 0) return <Nothing>{emptyLabel}</Nothing>;

  return (
    <ol className="space-y-1.5">
      {rows.map((row) => {
        const percent = total === undefined ? null : share(row.value, total);
        return (
          <li key={row.key} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3">
            <span className="truncate text-sm text-text" title={row.label}>
              {row.label}
            </span>

            <span className="h-3 rounded-full bg-surface-sunken" aria-hidden="true">
              <span
                className="block h-3 rounded-full bg-navy"
                style={{ width: `${barWidth(row.value, max)}%` }}
              />
            </span>

            <span className="whitespace-nowrap text-right text-sm tnum">
              <span className="font-bold text-text">
                {row.display ?? aed(row.value)}
              </span>
              {percent !== null && (
                <span className="ml-2 text-text-subtle">{percent}%</span>
              )}
              {row.note && (
                <span className="ml-2 text-xs text-text-subtle">{row.note}</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A figure that may not be knowable, said honestly.
 *
 * "Not enough data" and "nothing agreed" are different from zero, and a report
 * that renders either as a number is a report that gets acted on wrongly.
 */
export function Unknown({ children }: { children: React.ReactNode }) {
  return <span className="text-text-subtle">{children}</span>;
}
