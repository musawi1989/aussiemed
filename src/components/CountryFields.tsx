"use client";

import { useEffect, useState } from "react";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  flagSrc,
  dialCode,
  splitPhone,
  subdivisionLabel,
  subdivisionsOf,
} from "@/lib/geo";

/**
 * Country, the thing under it, and a phone number that carries its prefix.
 *
 * One component for all four places that ask — a branch, a supplier, a
 * delivery address at checkout, and a customer when that form exists — because
 * the alternative is four subtly different ideas of what an address is, and
 * the differences only surface when somebody tries to group orders by region.
 *
 * Three things it does that a plain set of boxes cannot:
 *
 *  - the subdivision is a dropdown where we hold the list and a text box where
 *    we do not, labelled with the word that country uses. "Emirate" for the
 *    UAE, "Governorate" for Oman, "State" for India.
 *  - the dialling prefix follows the country, so nobody types +971 and nobody
 *    forgets it.
 *  - changing the country clears the subdivision. Leaving "Dubai" selected
 *    under Germany is worse than an empty box, because it looks answered.
 *
 * The subdivision keeps the field name `emirate` throughout. That is the
 * column it has always been stored in and renaming it would touch fifteen
 * files and a migration for no gain a customer could see — the label above the
 * box is what a person reads, and that is now correct per country.
 */
/**
 * The caller's field classes with any top margin taken off.
 *
 * Every form hands us the class string it uses for a STANDALONE field, top
 * margin included, because that is the string it already had. Inside the phone
 * row that margin is wrong twice over: the row carries its own, and a margin
 * on one of two flex children makes them different heights.
 *
 * The obvious fix — appending "mt-0" — does not work, and looked like it did.
 * Tailwind decides between two conflicting utilities by their order in the
 * STYLESHEET, not their order in the attribute, and mt-1 sorts after mt-0. So
 * the input kept a 4px top margin, sat 4px lower than the prefix beside it and
 * stretched 4px shorter, and the seam showed on checkout and on the supplier
 * form. Removing the class is order-independent and works whatever a caller
 * passes.
 */
function withoutTopMargin(classes: string): string {
  // Split and filter rather than a regex: this function has been written
  // twice, and the first attempt shipped with its backslashes eaten, so the
  // pattern matched the LETTER s instead of whitespace and stripped
  // "mt-1 w-full rounded-card border border-" — everything up to the s in
  // "strong". The field lost its box entirely. Tokens have no escaping to
  // lose.
  return classes
    .split(" ")
    .filter((token) => token !== "" && !token.startsWith("mt-") && !token.startsWith("-mt-"))
    .join(" ");
}

/**
 * The caller's top-margin class, to put on the phone row.
 *
 * The row used to hardcode "mt-1". That is right for a form whose fields space
 * themselves with a margin on the input, and wrong for one that spaces them
 * with mb-1 on the label — there the phone sat a notch lower than the country
 * select above it. Taking the margin from the same string the selects use
 * means the three fields cannot drift apart whatever a form passes.
 */
function topMarginOf(classes: string): string {
  return classes
    .split(" ")
    .filter((token) => token.startsWith("mt-") || token.startsWith("-mt-"))
    .join(" ");
}

export function CountryFields({
  countryCode,
  subdivision,
  phone,
  /** Tailwind for the inputs, so each form keeps its own look. */
  inputClassName,
  labelClassName,
  hintClassName,
  required = false,
  /** Prefix for the field names, when a form carries two addresses. */
  prefix = "",
  phoneLabel = "Phone",
}: {
  countryCode?: string | null;
  subdivision?: string | null;
  phone?: string | null;
  inputClassName: string;
  labelClassName: string;
  hintClassName?: string;
  required?: boolean;
  prefix?: string;
  phoneLabel?: string;
}) {
  // A stored number already carries its country, so the dropdown opens where
  // the number says rather than making somebody set it twice.
  const fromPhone = splitPhone(phone);
  const initialCountry =
    countryCode?.toUpperCase() || fromPhone.countryCode || DEFAULT_COUNTRY;

  const [country, setCountry] = useState(initialCountry);
  // Cleared on a country change: "Dubai" sitting under Germany looks answered
  // and is not.
  const [region, setRegion] = useState(subdivision ?? "");

  const name = (field: string) => (prefix ? `${prefix}${field}` : field);
  const curated = subdivisionsOf(country);
  const label = subdivisionLabel(country);
  const prefixText = dialCode(country);
  const flag = flagSrc(country);

  /**
   * The other 135 countries' lists, fetched one country at a time.
   *
   * Seventeen countries are held in geo.ts and are already in this bundle, so
   * the common case — an Emirati address — has no request and no flicker. The
   * rest total about 3,300 entries, and this component renders on the sign-up
   * form, at checkout, on a supplier and on a customer: bundling them would
   * put 37KB of places nobody picked into all four, which is the weight BE-47
   * was raised about.
   *
   * "idle" is the state that matters. It is what a country with genuinely no
   * subdivisions falls back to (Singapore, Monaco), and what a failed request
   * falls back to — in both cases a free-text box, so a person can always
   * finish the form. A dropdown that failed to load and offers nothing is a
   * form nobody can submit.
   */
  const [fetched, setFetched] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (curated.length > 0) {
      setFetched(null);
      return;
    }

    // Aborted on a country change so a slow answer for the country somebody
    // has already moved on from cannot land after a fast one and repopulate
    // the box with the wrong country's provinces.
    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/v1/subdivisions/${country}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        setFetched(Array.isArray(body?.items) && body.items.length > 0 ? body.items : null);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        // Free text, not an error. The address still needs entering.
        setFetched(null);
        setLoading(false);
      });

    return () => controller.abort();
  }, [country, curated.length]);

  const list = curated.length > 0 ? curated : (fetched ?? []);
  const asDropdown = list.length > 0;

  return (
    <>
      <label className="block">
        <span className={labelClassName}>
          Country{required && <span className="ml-1 text-red">*</span>}
        </span>
        <select
          name={name("countryCode")}
          value={country}
          required={required}
          onChange={(event) => {
            setCountry(event.target.value);
            setRegion("");
          }}
          className={inputClassName}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelClassName}>
          {label}
          {required && <span className="ml-1 text-red">*</span>}
        </span>
        {asDropdown ? (
          <select
            name={name("emirate")}
            value={region}
            required={required}
            onChange={(event) => setRegion(event.target.value)}
            className={inputClassName}
          >
            <option value="">Choose a{label === "Emirate" ? "n" : ""} {label.toLowerCase()}</option>
            {list.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
            {/* Whatever was already stored, even if it is not on the list —
                otherwise opening an old address and saving it silently wipes
                a value that has been getting parcels delivered for a year. */}
            {region && !list.includes(region) && (
              <option value={region}>{region} (as entered)</option>
            )}
          </select>
        ) : (
          <input
            name={name("emirate")}
            value={region}
            required={required}
            onChange={(event) => setRegion(event.target.value)}
            className={inputClassName}
            placeholder={
              loading ? "Loading…" : `${label} or region`
            }
            // Still typeable while the list is on its way: somebody who knows
            // their own province should not be made to wait for a dropdown to
            // tell them what it is.
            readOnly={false}
          />
        )}
      </label>

      <label className="block">
        <span className={labelClassName}>
          {phoneLabel}
          {required && <span className="ml-1 text-red">*</span>}
        </span>
        <div className={`${topMarginOf(inputClassName)} flex items-stretch`.trim()}>
          {/* Shown, not typed. A prefix in the same box as the number is a
              prefix somebody deletes by accident. */}
          {/* The flag is a check, not decoration. The prefix alone asks
              somebody to know that +968 is Oman and +971 is not, and the two
              sit next to each other in the list; a flag is recognised without
              being read. Sized up a little because a 14px flag is a smudge.

              aria-hidden covers the whole group: the country is named in the
              select above, and a screen reader reading the flag and then the
              prefix says the same thing twice. */}
          <span
            aria-hidden="true"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-l-card border border-r-0 border-border-strong bg-surface-sunken px-3 text-sm font-semibold tnum text-text-muted"
          >
            {flag && (
              /* eslint-disable-next-line @next/next/no-img-element --
                 next/image wants a loader and a layout pass for a 20px static
                 SVG that changes with a select; a plain img is the whole job. */
              <img src={flag} alt="" width={20} height={15} className="rounded-[2px]" />
            )}
            {prefixText ?? "+"}
          </span>
          <input
            name={name("phoneNational")}
            type="tel"
            required={required}
            defaultValue={fromPhone.national}
            placeholder="50 123 4567"
            className={`${withoutTopMargin(inputClassName)} rounded-l-none`}
          />
        </div>
        {hintClassName && (
          <span className={hintClassName}>
            Just the local number — {prefixText ?? "the country code"} is added
            for you.
          </span>
        )}
      </label>
    </>
  );
}
