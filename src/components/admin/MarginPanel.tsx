import { formatAED } from "@/lib/money";
import { marginBand, type Margin } from "@/lib/margin";

/**
 * Cost, sell and margin — admin only.
 *
 * Nothing in here is imported by the storefront or the supplier portal, and
 * the data it renders is fetched only by admin-guarded functions. See
 * margin-data.ts for why that is the guard rather than a filter.
 *
 * An unknown cost renders as "not recorded" and never as a dash beside a
 * percentage, because the two say different things and the difference is the
 * whole point: no cost loaded is not the same as no margin made.
 */

const aed = (fils: number) => formatAED(fils / 100);

const TONE: Record<ReturnType<typeof marginBand>, string> = {
  unknown: "bg-surface-sunken text-text-muted",
  loss: "bg-danger-soft text-danger",
  thin: "bg-accent-soft text-accent",
  fair: "bg-navy-soft text-navy",
  good: "bg-success-soft text-success",
};

export function MarginPill({
  margin,
  incomplete = false,
}: {
  margin: Margin;
  /** Part-delivered: there is a cost, but not the whole cost. */
  incomplete?: boolean;
}) {
  const band = marginBand(margin);

  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold tnum ${TONE[band]}`}
      title={
        band === "unknown"
          ? incomplete
            ? "Not all of this line has been bought yet"
            : "No cost recorded for this item"
          : undefined
      }
    >
      {margin.marginPercent === null
        ? incomplete
          ? "part bought"
          : "no cost"
        : `${margin.marginPercent > 0 ? "+" : ""}${margin.marginPercent}%`}
    </span>
  );
}

/** Sell, cost and margin as three figures on one row. */
export function MarginFigures({ margin }: { margin: Margin }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
      <Figure label="We sell at" value={aed(margin.sellFils)} />
      <Figure
        label="We pay"
        value={margin.costFils === null ? "not recorded" : aed(margin.costFils)}
        muted={margin.costFils === null}
      />
      <Figure
        label="Margin"
        value={
          margin.marginFils === null
            ? "—"
            : `${aed(margin.marginFils)} (${margin.marginPercent}%)`
        }
        muted={margin.marginFils === null}
        danger={margin.losing}
      />
    </dl>
  );
}

function Figure({
  label,
  value,
  muted = false,
  danger = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  danger?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </dt>
      <dd
        className={`font-bold tnum ${
          danger ? "text-danger" : muted ? "text-text-subtle" : "text-text"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
