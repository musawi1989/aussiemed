import type { Metadata } from "next";
import { BulkBuyForm } from "./BulkBuyForm";

export const metadata: Metadata = {
  title: "Bulk Buy Enquiry",
  description:
    "Request tailored pricing for large or recurring orders. Tell us the products, quantities and delivery schedule and our team will come back with a quote in AED.",
};

export default function BulkBuyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-text">
        Bulk buy enquiry
      </h1>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-text-muted">
        Ordering in volume, or setting up a recurring schedule? Send us the
        details and we&rsquo;ll come back with pricing beyond the published
        breaks.
      </p>
      <div className="mt-8">
        <BulkBuyForm />
      </div>
    </div>
  );
}
