import type { Metadata } from "next";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { PriceRequestRow } from "@/components/admin/PriceRequestRow";
import { pendingPriceRequests } from "@/lib/supply-pricing";
import { SUPPLIER_TABS } from "../tabs";

export const metadata: Metadata = {
  title: "Price requests",
  robots: { index: false, follow: false },
};

/**
 * Prices suppliers have asked for and nobody has agreed to.
 *
 * A supplier can change everything about an item except what we pay for it.
 * That one field is a term between two companies, so it lands here instead of
 * taking effect, and until somebody decides, every purchase order and margin
 * figure uses the price that was actually agreed.
 *
 * Oldest first, deliberately. A request sitting for three weeks is the one
 * somebody needs to see; the one filed this morning can wait.
 */
export default async function PriceRequestsPage() {
  const requests = await pendingPriceRequests();

  return (
    <div>
      <SectionTabs tabs={SUPPLIER_TABS} />

      <div className="mt-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-text">
          Price requests
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          What suppliers have asked to be paid. Nothing here is in force — the
          agreed cost stays on the line, and on every purchase order, until it
          is accepted.
        </p>
      </div>

      {requests.length === 0 ? (
        <p className="mt-6 rounded-card border border-border-base bg-surface px-4 py-8 text-center text-sm text-text-muted">
          Nothing waiting. Requests appear here when a supplier changes a price
          in their portal or uploads a price file.
        </p>
      ) : (
        <>
          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-text-muted">
            {requests.length === 1
              ? "1 request waiting"
              : `${requests.length} requests waiting`}
          </p>
          <ul className="mt-2 space-y-3">
            {requests.map((request) => (
              <PriceRequestRow key={request.supplyId} request={request} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
