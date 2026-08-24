import type { Metadata } from "next";
import Link from "next/link";
import { AvailabilityToggle } from "@/components/supplier/AvailabilityToggle";
import { SupplyRow } from "@/components/supplier/SupplyRow";
import {
  alternativeChoices,
  listMySupplies,
  myCompany,
} from "@/lib/supplier-portal";

export const metadata: Metadata = {
  title: "What you supply",
  robots: { index: false, follow: false },
};

/**
 * The packs a supplier supplies, and the terms they set on each.
 *
 * What is not here is as deliberate as what is. There is no way to add a pack:
 * which suppliers can supply what is a commercial decision made in the admin,
 * and a portal that could create the pairing would let a supplier appoint
 * themselves to a competitor's line. There is no selling price and no margin —
 * those are never fetched, so they cannot leak. And there are no customers
 * anywhere in this portal at all.
 */
export default async function SuppliesPage() {
  const [supplies, company, alternatives] = await Promise.all([
    listMySupplies(),
    myCompany(),
    alternativeChoices(),
  ]);

  const unavailable = supplies.filter((s) => !s.isAvailable);
  const noPrice = supplies.filter((s) => s.costFils === null);

  return (
    <div className="px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">
            What you supply
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-text-muted tnum">
            {supplies.length} item{supplies.length === 1 ? "" : "s"} we can order
            from you. Your price, your part number and your lead time are yours
            to set here.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Adding one item and re-pricing hundreds are different jobs, so
              they are different buttons. The primary one is Add, because a
              supplier who has just been set up has nothing to update yet. */}
          <Link
            href="/business-portal/supplies/add"
            className="rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover"
          >
            Add items
          </Link>
          <Link
            href="/business-portal/supplies/upload"
            className="rounded-card border border-border-strong bg-surface px-4 py-2 text-sm font-bold text-text transition-colors hover:border-navy hover:text-navy"
          >
            Update by spreadsheet
          </Link>
        </div>
      </div>

      <div className="mt-5">
        <AvailabilityToggle available={company?.isAvailable ?? true} />
      </div>

      {/* Said once at the top rather than repeated on every row. */}
      {noPrice.length > 0 && (
        <p className="mt-4 rounded-card border-l-4 border-accent-border bg-accent-soft px-4 py-2.5 text-sm text-text tnum">
          {noPrice.length} item{noPrice.length === 1 ? " has" : "s have"} no
          price agreed yet. We can still order{" "}
          {noPrice.length === 1 ? "it" : "them"}, but neither of us has a figure
          to check the invoice against.
        </p>
      )}

      {unavailable.length > 0 && (
        <p className="mt-3 rounded-card border-l-4 border-accent-border bg-accent-soft px-4 py-2.5 text-sm text-text tnum">
          {unavailable.length} item{unavailable.length === 1 ? " is" : "s are"}{" "}
          marked as something you cannot currently supply. Those go to the other
          supplier until you say otherwise.
        </p>
      )}

      {supplies.length === 0 ? (
        <p className="mt-5 rounded-card border border-border-base bg-surface px-4 py-12 text-center text-sm text-text-muted shadow-card">
          Nothing here yet. Tell us what you stock with
          <span className="font-semibold text-text"> Add items</span> above,
          or send us a spreadsheet. Which supplier we buy each item from is
          still set by AussieMed.
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {supplies.map((supply) => (
            <SupplyRow
              key={supply.id}
              supply={supply}
              alternatives={alternatives}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
