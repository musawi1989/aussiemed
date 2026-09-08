import { ProductThumbnail } from "@/components/ProductThumbnail";
import Link from "next/link";
import type { BackorderLine } from "@/lib/backorders";

/**
 * What this supplier told us they cannot send.
 *
 * ALWAYS ON THE PURCHASE ORDERS SCREEN, empty or not. A section that appears
 * only when something is wrong is a section nobody learns the location of, and
 * "nothing outstanding" is itself worth saying out loud to somebody who has
 * just confirmed a difficult order.
 *
 * Grouped by order, because that is how a supplier works through them — an
 * order is the thing they picked, packed and are answering for. A flat list of
 * items sorted by name would scatter one order across the page.
 *
 * The wording is deliberately not accusatory. These are lines they told us
 * about, which is the behaviour we want: a supplier who says nothing is worse
 * than one who says they are short.
 */
export function BackorderList({ lines }: { lines: BackorderLine[] }) {
  const byOrder = new Map<string, BackorderLine[]>();
  for (const line of lines) {
    const list = byOrder.get(line.poNumber) ?? [];
    list.push(line);
    byOrder.set(line.poNumber, list);
  }

  const units = lines.reduce((n, l) => n + l.shortfall, 0);

  return (
    <section className="mt-8 rounded-card border border-border-base bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold tracking-tight text-text">
            Back orders
          </h2>
          <p className="mt-1 max-w-xl text-sm text-text-muted">
            Lines you have told us you cannot send in full. We cover these
            elsewhere, so you do not need to chase them &mdash; they are here so
            you can see what we are still expecting from you and what we are not.
          </p>
        </div>
        {lines.length > 0 && (
          <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-bold tnum text-accent">
            {units} {units === 1 ? "unit" : "units"} short
          </span>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="mt-4 rounded-card border border-border-base bg-surface-sunken px-4 py-6 text-center text-sm text-text-muted">
          Nothing outstanding. Every line you have answered, you can supply in
          full.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {[...byOrder.entries()].map(([poNumber, group]) => (
            <div key={poNumber}>
              <h3 className="flex flex-wrap items-baseline gap-2 text-sm font-bold text-text">
                <Link
                  href={`/business-portal/orders/${poNumber}`}
                  className="tnum text-navy hover:underline"
                >
                  {poNumber}
                </Link>
                <span className="text-xs font-medium text-text-subtle tnum">
                  {group.length} {group.length === 1 ? "line" : "lines"}
                </span>
              </h3>

              <ul className="mt-1.5 divide-y divide-border-base rounded-card border border-border-base">
                {group.map((line) => (
                  <li
                    key={line.lineId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-text">
                        <ProductThumbnail skuCode={line.skuCode} />{line.name}
                      </span>
                      <span className="block text-xs tnum text-text-subtle">
                        {line.skuCode}
                      </span>
                    </span>

                    {/* Said plainly. A number on its own leaves the reader
                        working out which of three quantities it is. */}
                    <span className="text-sm tnum text-text-muted">
                      you can send{" "}
                      <span className="font-bold text-text">
                        {line.qtyConfirmed}
                      </span>{" "}
                      of {line.qtyOrdered}
                    </span>

                    <span
                      className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold tnum text-accent"
                      title="Units on this line nobody has committed to yet"
                    >
                      {line.shortfall} missing
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
