"use client";

import { useState } from "react";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  dialCode,
  hasSubdivisions,
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
  const list = subdivisionsOf(country);
  const label = subdivisionLabel(country);
  const prefixText = dialCode(country);

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
        {hasSubdivisions(country) ? (
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
            placeholder={`${label} or region`}
          />
        )}
      </label>

      <label className="block">
        <span className={labelClassName}>
          {phoneLabel}
          {required && <span className="ml-1 text-red">*</span>}
        </span>
        <div className="mt-1 flex">
          {/* Shown, not typed. A prefix in the same box as the number is a
              prefix somebody deletes by accident. */}
          <span
            aria-hidden="true"
            className="inline-flex shrink-0 items-center rounded-l-card border border-r-0 border-border-strong bg-surface-sunken px-3 text-sm font-semibold tnum text-text-muted"
          >
            {prefixText ?? "+"}
          </span>
          <input
            name={name("phoneNational")}
            type="tel"
            required={required}
            defaultValue={fromPhone.national}
            placeholder="50 123 4567"
            className={`${inputClassName} mt-0 rounded-l-none`}
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
