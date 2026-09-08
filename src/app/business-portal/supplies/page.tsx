import type { Metadata } from "next";
import Link from "next/link";
import { AvailabilityToggle } from "@/components/supplier/AvailabilityToggle";
import { SupplyRow } from "@/components/supplier/SupplyRow";
import { SupplyFilters } from "@/components/portal/SupplyFilters";
import {
  alternativeChoices,
  listMySupplies,
  myCompany,
} from "@/lib/supplier-portal";
import { supplierPermissions } from "@/lib/permissions";

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
export default async function SuppliesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; show?: string }>;
}) {
  const filters = await searchParams;
  const [supplies, company, alternatives, perms] = await Promise.all([
    listMySupplies(),
    myCompany(),
    alternativeChoices(),
    /*
     * What this supplier is allowed to do, set on admin Roles and permissions.
     *
     * Read here and passed down rather than read inside each row: one query
     * for a page instead of one per item, and — more to the point — the page
     * needs it too, for the buttons at the top that no row can see.
     *
     * HIDING IS A COURTESY, NOT THE CONTROL. Every one of these is enforced
     * again on the server when the form posts, because a page left open while
     * a permission changes still has its buttons.
     */
    supplierPermissions(),
  ]);

  const unavailable = supplies.filter((s) => !s.isAvailable);
  const noPrice = supplies.filter((s) => s.costFils === null);

  /*
   * Filtered here rather than in listMySupplies.
   *
   * That query is written to a strict rule about what it may select — no rank,
   * no selling price, no margin — and every filter added to it is another
   * chance to widen it by accident. A supplier's own list is at most a few
   * hundred rows, so narrowing it in memory costs nothing and leaves the
   * guarded query exactly as it was.
   *
   * The counts above stay on the WHOLE list: "3 items cannot be supplied" must
   * not become "0" because somebody searched for gloves.
   */
  const term = (filters.q ?? "").trim().toLowerCase();
  const shown = supplies.filter((s) => {
    if (filters.show === "unavailable" && s.isAvailable) return false;
    if (filters.show === "noprice" && s.costFils !== null) return false;
    if (!term) return true;
    return (
      s.productName.toLowerCase().includes(term) ||
      s.skuCode.toLowerCase().includes(term) ||
      (s.supplierPartNumber ?? "").toLowerCase().includes(term)
    );
  });

  const filtering = Boolean(term || (filters.show && filters.show !== "all"));

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
          {perms.addItems !== "off" && (
            <Link
              href="/business-portal/supplies/add"
              className="rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover"
            >
              Add items
            </Link>
          )}
          {/* The spreadsheet route writes the same fields as the form, so it
              answers to the same permissions. Hidden when there is nothing it
              could still change, rather than left as a page that accepts an
              upload and applies none of it. */}
          {(perms.editTerms !== "off" || perms.changePrice !== "off") && (
            <Link
              href="/business-portal/supplies/upload"
              className="rounded-card border border-border-strong bg-surface px-4 py-2 text-sm font-bold text-text transition-colors hover:border-navy hover:text-navy"
            >
              Update by spreadsheet
            </Link>
          )}
        </div>
      </div>

      {/* Still shown to a supplier who is already off, whatever the
          permission says: they must always be able to turn themselves back on. */}
      {(perms.pauseAccount !== "off" || company?.isAvailable === false) && (
        <div className="mt-5">
          <AvailabilityToggle available={company?.isAvailable ?? true} />
        </div>
      )}

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
          {perms.addItems === "off" ? (
            <>
              Nothing here yet. AussieMed sets what each supplier covers, so
              get in touch and we will add what you stock.
            </>
          ) : (
            <>
              Nothing here yet. Tell us what you stock with
              <span className="font-semibold text-text"> Add items</span> above,
              or send us a spreadsheet. Which supplier we buy each item from is
              still set by AussieMed.
            </>
          )}
        </p>
      ) : (
        <>
        <SupplyFilters
          current={filters}
          counts={{ unavailable: unavailable.length, noPrice: noPrice.length }}
        />

        {filtering && (
          <p className="mt-2 text-xs text-text-muted tnum">
            {shown.length} of {supplies.length} shown.{" "}
            <a
              href="/business-portal/supplies"
              className="font-semibold text-navy hover:underline"
            >
              Clear filters
            </a>
          </p>
        )}

        {shown.length === 0 ? (
          <p className="mt-4 rounded-card border border-border-base bg-surface px-4 py-10 text-center text-sm text-text-muted shadow-card">
            Nothing matches those filters.
          </p>
        ) : (
        <ul className="mt-4 space-y-2">
          {shown.map((supply) => (
            <SupplyRow
              key={supply.id}
              supply={supply}
              alternatives={alternatives}
              perms={perms}
            />
          ))}
        </ul>
        )}
        </>
      )}
    </div>
  );
}
