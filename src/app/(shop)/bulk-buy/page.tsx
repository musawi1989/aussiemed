import type { Metadata } from "next";
import { BulkBuyForm } from "./BulkBuyForm";

export const metadata: Metadata = {
  title: "Bulk Buy Enquiry",
  description:
    "Request tailored pricing for large or recurring orders. Tell us the products, quantities and delivery schedule and our team will come back with a quote in AED.",
};

/** Trimmed because it is echoed back on the page and stored on the enquiry. */
const ABOUT_MAX = 80;

export default async function BulkBuyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).about;
  // Carried in from a category or search that had nothing to show, so the
  // enquiry arrives in the admin queue saying what it is about rather than
  // blank. See DEC-27.
  const about = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, ABOUT_MAX);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-text">
        {about ? `Enquire about ${about}` : "Bulk buy enquiry"}
      </h1>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-text-muted">
        {about
          ? "Tell us which products and quantities you need and we’ll come back with a price and a lead time."
          : "Ordering in volume, or setting up a recurring schedule? Send us the details and we’ll come back with pricing beyond the published breaks."}
      </p>
      <div className="mt-8">
        <BulkBuyForm about={about} />
      </div>
    </div>
  );
}
