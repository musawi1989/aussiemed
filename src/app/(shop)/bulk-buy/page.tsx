import type { Metadata } from "next";
import Link from "next/link";
import { QuoteProgress } from "./QuoteProgress";

export const metadata: Metadata = {
  title: "Get Bulk Prices",
  description:
    "How to build a bulk price request: add the products and quantities you need to a bulk buy request and our team comes back with pricing in AED and a lead time.",
};

/**
 * How to ask for bulk pricing.
 *
 * THIS USED TO BE A FORM — a free-text box asking the buyer to type out the
 * products and quantities they wanted. It worked, and it duplicated something
 * better: every product page already has "Add to bulk buy request", which puts a
 * real SKU and a real pack size on a list that the sales team can price without
 * having to work out what "gloves, medium, 40 boxes" refers to.
 *
 * Two routes to the same request meant two admin queues, two sets of wording,
 * and a buyer choosing between them with no way to know that one carries pack
 * codes and the other carries prose. This page now teaches the good route
 * rather than competing with it.
 *
 * NOT A DEAD END FOR THINGS WE DO NOT LIST. A buyer who cannot find what they
 * want still needs somewhere to say so, and they cannot add a product that is
 * not in the catalogue. That is what the notes box on the bulk buy request is for,
 * and this page says so explicitly rather than leaving them to guess.
 */

/** Trimmed because it is echoed back on the page. */
const ABOUT_MAX = 80;

const STEPS = [
  {
    title: "Find what you need",
    body: "Browse the range or use the search box at the top of any page. Every product we list can go on a bulk price request.",
    action: { label: "Browse the full range", href: "/products" },
  },
  {
    title: "Choose the pack and the quantity",
    body: "On the product page, pick the pack size you buy in and set how many you want. Any published volume breaks are shown there too, so you can see where the price already steps down before you ask.",
  },
  {
    title: "Press “Add to bulk buy request”",
    body: "The button sits just under “Add to cart” on every product. Nothing is ordered and nothing is charged — it only adds the line to your list.",
  },
  {
    title: "Build up the whole list",
    body: "Repeat for as many products as you need. The request icon in the header counts your lines as they go on, so you can put a full standing order into one request rather than sending several.",
  },
  {
    title: "Review, add your notes, and send",
    body: "Open your bulk buy request to change quantities or remove a line. Use “Notes and requests” to tell us about delivery schedules, recurring monthly orders, or anything you need us to source that is not on the site.",
    action: { label: "Open your bulk buy request", href: "/quote" },
  },
  {
    title: "We come back with a price",
    body: "You get a reference number on screen straight away. Our team replies with pricing in AED and a lead time, and you can quote that reference if you need to chase it.",
  },
];

export default async function BulkPricesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).about;
  // Carried in from a category or a search that had nothing to show, so the
  // page can acknowledge what the buyer was actually after instead of opening
  // with generic instructions. See DEC-27.
  const about = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, ABOUT_MAX);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight text-text">
        Get bulk prices
      </h1>
      <p className="mt-3 max-w-prose text-base leading-relaxed text-text-muted">
        Ordering in volume, or setting up a recurring schedule? Build a list of
        the products and quantities you want, send it as a bulk buy request, and
        our team comes back with pricing beyond the published breaks.
      </p>

      {about && (
        <div className="mt-6 rounded-panel border border-border-base bg-surface-sunken p-5">
          <p className="text-sm font-bold text-text">
            You were looking for {about}.
          </p>
          <p className="mt-1 text-sm text-text-muted">
            If we do not list it yet, say so in the notes on your bulk buy request
            — a lot of what we supply is sourced to order.
          </p>
          <Link
            href="/quote"
            className="mt-3 inline-block text-sm font-bold text-navy hover:underline"
          >
            Go straight to your bulk buy request &rarr;
          </Link>
        </div>
      )}

      <div className="mt-8">
        <QuoteProgress />
      </div>

      <ol className="mt-8 space-y-4">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="flex gap-4 rounded-panel border border-border-base bg-surface p-5 shadow-card"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold tnum text-on-navy"
            >
              {index + 1}
            </span>
            <div>
              <h2 className="text-base font-bold text-text">{step.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                {step.body}
              </p>
              {step.action && (
                <Link
                  href={step.action.href}
                  className="mt-3 inline-block text-sm font-bold text-navy hover:underline"
                >
                  {step.action.label} &rarr;
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-panel border border-border-base bg-surface-sunken p-6">
        <h2 className="text-base font-bold text-text">Worth knowing</h2>
        <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-text-muted">
          <li>
            <span className="font-semibold text-text">
              A bulk buy request is not an order.
            </span>{" "}
            Nothing is reserved and nothing is charged. Prices shown against the
            lines are the published ones, for reference only — the figure that
            matters comes back from our team.
          </li>
          <li>
            <span className="font-semibold text-text">
              Signed in? We already have your details.
            </span>{" "}
            You will not be asked to type your company, email or phone number
            again. Guests are asked once, on the bulk buy request itself.
          </li>
          <li>
            <span className="font-semibold text-text">
              Your list is kept as you go.
            </span>{" "}
            Add products across several visits and they will still be there when
            you come back to send the request.
          </li>
          <li>
            <span className="font-semibold text-text">
              Cannot find something?
            </span>{" "}
            Put it in the notes on your bulk buy request. We supply a great deal
            more than is listed on the site and bring in stock to order.
          </li>
        </ul>
      </div>

      <p className="mt-8 text-sm text-text-muted">
        Prefer to talk it through?{" "}
        <Link href="/contact" className="font-bold text-navy hover:underline">
          Contact us
        </Link>{" "}
        and we will take the details over the phone.
      </p>
    </div>
  );
}
