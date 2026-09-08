import type { Metadata } from "next";
import { QuoteView } from "./QuoteView";
import { signedInBuyer } from "@/lib/enquiries";

export const metadata: Metadata = {
  title: "Bulk Buy Request",
  description:
    "Build a list of products and request tailored pricing from the AussieMed team. Quoted prices are confirmed by us and may differ from published rates.",
};

export default async function QuotePage() {
  // Signed in as a buyer: the form stops asking who they are.
  const account = await signedInBuyer();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-text">
        Bulk buy request
      </h1>
      <p className="mb-6 mt-1 max-w-prose text-sm text-text-muted">
        Lines you&rsquo;d like priced. This is an enquiry, not an order &mdash;
        nothing is reserved and nothing is charged.
      </p>
      <QuoteView account={account} />
    </div>
  );
}
