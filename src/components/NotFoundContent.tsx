import Link from "next/link";

/** The 404 itself, with no chrome of its own — see the two not-found files. */
export function NotFoundContent() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-brand">
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text">
        We couldn&rsquo;t find that page
      </h1>
      <p className="mt-3 text-text-muted">
        The link may be out of date, or the product may no longer be listed.
      </p>
      <Link
        href="/products"
        className="mt-6 inline-block rounded-card bg-brand px-5 py-2.5 font-medium text-on-brand transition-colors hover:bg-brand-hover"
      >
        Browse the catalogue
      </Link>
    </div>
  );
}
