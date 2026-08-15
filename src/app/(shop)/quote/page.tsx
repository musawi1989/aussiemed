import type { Metadata } from "next";
import { QuoteView } from "./QuoteView";

export const metadata: Metadata = {
  title: "Quote Request",
  description:
    "Build a list of products and request tailored pricing from the AussieMed team. Quoted prices are confirmed by us and may differ from published rates.",
};

export default function QuotePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-text">
        Quote request
      </h1>
      <p className="mb-6 mt-1 max-w-prose text-sm text-text-muted">
        Lines you&rsquo;d like priced. This is an enquiry, not an order &mdash;
        nothing is reserved and nothing is charged.
      </p>
      <QuoteView />
    </div>
  );
}
