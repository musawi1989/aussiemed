import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { readCartKey } from "@/lib/cart-cookie";
import { reorderPreview } from "@/lib/account";
import { ReorderForm } from "@/components/ReorderForm";

export const metadata: Metadata = {
  title: "Reorder",
  description: "Repeat a previous AussieMed order, adjusting quantities first.",
};

/**
 * Repeating a past order.
 *
 * Deliberately a review step rather than a one-click "buy it all again". A
 * trade buyer repeating last month rarely wants exactly last month: something
 * is not needed this time, something has doubled, and one line has been
 * discontinued since. Showing that before the basket is faster than unpicking
 * it afterwards.
 */
export default async function ReorderPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/account");

  const { reference } = await params;
  const preview = await reorderPreview(
    decodeURIComponent(reference),
    await readCartKey()
  );

  if (!preview) notFound();

  const unavailable = preview.lines.filter((l) => !l.available);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/account"
        className="text-sm font-semibold text-text-muted hover:text-navy"
      >
        &larr; Your account
      </Link>

      <h1 className="mt-1 text-2xl font-bold tracking-tight text-text">
        Reorder {preview.reference}
      </h1>
      <p className="mt-1 text-sm text-text-muted tnum">
        Originally placed {preview.placedAt.toISOString().slice(0, 10)} &middot;{" "}
        {preview.lines.length} {preview.lines.length === 1 ? "line" : "lines"}.
        Untick anything you do not need and change the quantities before adding.
      </p>

      {unavailable.length > 0 && (
        <p className="mt-4 rounded-card border-l-4 border-accent-border bg-accent-soft px-4 py-2.5 text-sm text-text">
          {unavailable.length} {unavailable.length === 1 ? "line has" : "lines have"}{" "}
          changed since you last ordered and cannot be added. They are shown
          below so you can find a replacement rather than discover the gap on
          delivery.
        </p>
      )}

      <div className="mt-6">
        <ReorderForm lines={preview.lines} cartCount={preview.cartCount} />
      </div>

      <p className="mt-6 text-xs leading-relaxed text-text-subtle">
        Priced at today&rsquo;s catalogue prices, not the prices on the original
        order.
      </p>
    </div>
  );
}
