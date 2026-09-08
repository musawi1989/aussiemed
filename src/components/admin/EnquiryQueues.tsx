import Link from "next/link";
import { db } from "@/lib/db";

const daysAgo = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);

/**
 * The restock waitlist — FN-04.
 *
 * WAS THREE QUEUES UNTIL 3 SEP 2026. Quote requests and bulk-buy enquiries
 * sat here too, as two headings describing one conversation that arrived
 * through two doors. They are now one thing called a bulk buy request, with
 * its own section in the sidebar, because a queue somebody has to scroll to
 * the bottom of another page to find is a queue that gets worked late.
 *
 * What is left is the one queue that genuinely belongs on a page about what
 * needs attention rather than in a section of its own: people waiting on a
 * pack to come back, which is not a conversation with anybody and needs no
 * answering — it sends itself when the stock returns.
 *
 * Grouped by pack, ranked by how many are waiting, because fourteen clinics
 * waiting on one item is a different conversation from fourteen people waiting
 * on fourteen items.
 *
 * It keeps its id, so the card at the top of Needs attention still jumps here
 * instead of to the top of the page.
 */
export async function EnquiryQueues() {
  const waitlist = await db.notifySubscription.findMany({
    where: { notifiedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      sku: {
        select: {
          skuCode: true,
          unitLabel: true,
          manualOutOfStock: true,
          product: { select: { id: true, name: true } },
        },
      },
    },
  });

  /* Grouped by pack: fourteen clinics waiting on one item is a different
     conversation from fourteen people waiting on fourteen items. */
  const byPack = new Map<
    string,
    { name: string; productId: string; unitLabel: string; count: number; oldest: Date; outOfStock: boolean }
  >();
  for (const row of waitlist) {
    const key = row.sku.skuCode;
    const existing = byPack.get(key);
    if (existing) {
      existing.count++;
      if (row.createdAt < existing.oldest) existing.oldest = row.createdAt;
    } else {
      byPack.set(key, {
        name: row.sku.product.name,
        productId: row.sku.product.id,
        unitLabel: row.sku.unitLabel,
        count: 1,
        oldest: row.createdAt,
        outOfStock: row.sku.manualOutOfStock,
      });
    }
  }
  const packs = [...byPack.entries()].sort((a, b) => b[1].count - a[1].count);

  // Nothing waiting: show nothing at all rather than a heading over an empty
  // list, on a page that is already about what needs doing.
  if (packs.length === 0) return null;

  return (
    <>
      <p className="mt-8 rounded-card border-l-4 border-navy-border bg-navy-soft px-4 py-2.5 text-sm text-text">
        Nothing here needs an email written. The restock list sends on its own
        when a pack comes back in stock. Bulk buy requests moved to their own
        section &mdash;{" "}
        <Link href="/admin/bulk-buy" className="font-bold text-navy hover:underline">
          open them
        </Link>
        .
      </p>

      <h2
        id="waiting-on-stock"
        className="mt-8 scroll-mt-6 text-base font-bold tracking-tight text-text"
      >
        Waiting on stock
      </h2>
      {packs.length === 0 ? (
        <Empty>Nobody is waiting on a restock.</Empty>
      ) : (
        <ul className="mt-3 space-y-2">
          {packs.map(([skuCode, pack]) => (
            <li
              key={skuCode}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-base bg-surface p-4 shadow-card"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/products/${pack.productId}`}
                  className="text-sm font-bold text-navy hover:underline"
                >
                  {pack.name}
                </Link>
                <p className="text-xs tnum text-text-subtle">
                  {skuCode} &middot; {pack.unitLabel} &middot; longest wait{" "}
                  {daysAgo(pack.oldest)} days
                  {!pack.outOfStock && " · back in stock, nobody told yet"}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-sm font-bold text-accent tnum">
                {pack.count} waiting
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-card border border-border-base bg-surface px-4 py-8 text-center text-sm text-text-muted shadow-card">
      {children}
    </p>
  );
}
