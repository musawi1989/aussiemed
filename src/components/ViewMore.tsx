import Link from "next/link";

/**
 * "View more", in place of numbered pages.
 *
 * Numbered pages suit a list somebody is looking up a known item in. Browsing
 * a catalogue is the other thing: you are comparing what is on screen, and
 * page two throws away everything you were comparing it against. So this only
 * ever adds — the products already seen stay exactly where they were.
 *
 * A link rather than a button, and the count is in the URL rather than in
 * component state, which buys three things for nothing: it works with
 * JavaScript off, the back button returns you to the shorter list instead of
 * the top of the site, and a page showing ninety-six products can be sent to a
 * colleague and arrive showing ninety-six products.
 *
 * The count above it is not decoration. An endless list with no idea how much
 * is left is a list people give up on, and "48 of 60" tells you one more click
 * finishes it.
 */
export function ViewMore({
  shown,
  total,
  hasMore,
  nextHref,
}: {
  shown: number;
  total: number;
  hasMore: boolean;
  nextHref: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm tnum text-text-muted" role="status">
        Showing {shown} of {total} {total === 1 ? "product" : "products"}
      </p>

      {hasMore ? (
        <Link
          href={nextHref}
          // `scroll={false}` keeps the page where it is when more arrive.
          // Jumping to the top would undo the whole point of adding to the
          // list rather than replacing it.
          scroll={false}
          className="rounded-card border border-border-strong bg-surface px-6 py-2.5 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
        >
          View more
        </Link>
      ) : (
        total > 0 && (
          <p className="text-xs text-text-subtle">That is everything.</p>
        )
      )}
    </div>
  );
}
