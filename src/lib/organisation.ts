import { countryByCode, subdivisionLabel, subdivisionsOf } from "./geo.ts";
import { isRealTrn, normaliseTrn } from "./trn.ts";
import { isPaymentTerms } from "./payment-options.ts";

/**
 * The rules for a customer account, as an admin sets it up — FN-19.
 *
 * Until now an organisation could only be created by a business applying
 * through the sign-up form, or by writing a row into the database by hand. So
 * an account taken over the phone had nowhere to live, and the country and
 * region pickers added in FE-39 could not reach a customer at all: three of the
 * four forms the client asked for existed and this was the missing one.
 *
 * No database access here on purpose. The same rules are then applied by the
 * admin form, by the server action behind it and by anything that comes later —
 * an import, a second screen — rather than three copies drifting apart.
 */

export const ORG_NAME_MIN = 2;
export const ORG_NAME_MAX = 120;
export const ORG_NOTES_MAX = 2000;

export type OrganisationInput = {
  name: string;
  /** Optional: many accounts are not registered for VAT. See AC-03. */
  trn: string | null;
  phone: string | null;
  countryCode: string;
  /** Emirate, state or province — whatever the country calls it. */
  emirate: string | null;
  notes: string | null;
  isDisabled: boolean;
  paymentTerms?: string;
};

export type Problem = { field: string; message: string };

/** Trimmed, blanked and normalised, so validation and storage see one shape. */
export function normaliseOrganisation(input: OrganisationInput): OrganisationInput {
  const blank = (v: string | null) => {
    const trimmed = (v ?? "").trim();
    return trimmed === "" ? null : trimmed;
  };

  return {
    name: input.name.trim().replace(/\s+/g, " "),
    // Stored as fifteen digits with no spacing, so two records of the same
    // number cannot look like two different numbers.
    trn: normaliseTrn(input.trn),
    phone: blank(input.phone),
    countryCode: (input.countryCode || "").trim().toUpperCase(),
    emirate: blank(input.emirate),
    notes: blank(input.notes),
    isDisabled: input.isDisabled,
    ...(input.paymentTerms !== undefined ? { paymentTerms: input.paymentTerms.trim() } : {}),
  };
}

export function validateOrganisation(raw: OrganisationInput): Problem | null {
  const input = normaliseOrganisation(raw);
  if (input.paymentTerms !== undefined && !isPaymentTerms(input.paymentTerms)) return { field: "paymentTerms", message: "Choose payment terms or complete the custom terms and due days." };

  if (input.name.length < ORG_NAME_MIN) {
    return { field: "name", message: "Give the account a name." };
  }
  if (input.name.length > ORG_NAME_MAX) {
    return {
      field: "name",
      message: `Keep the name under ${ORG_NAME_MAX} characters.`,
    };
  }

  const country = countryByCode(input.countryCode);
  if (!country) {
    return { field: "countryCode", message: "Choose a country." };
  }

  /**
   * A TRN is optional — plenty of buyers are not registered — but a wrong one
   * is worse than none. It is printed on a tax invoice the customer keeps, and
   * the placeholder range exists precisely so a test number cannot be mistaken
   * for a real registration (see e60504c and AC-03).
   */
  if (raw.trn && (raw.trn ?? "").trim() !== "" && !isRealTrn(input.trn)) {
    return {
      field: "trn",
      message:
        "A TRN is 15 digits. Leave it blank if the account is not registered for VAT.",
    };
  }

  /**
   * The region is checked against the country's own list rather than accepted
   * as typed. An invoice addressed to an emirate that does not exist is a
   * document somebody has to explain, and the list is already the one the
   * picker offers.
   */
  const regions = subdivisionsOf(input.countryCode);
  if (input.emirate && regions.length > 0 && !regions.includes(input.emirate)) {
    return {
      field: "emirate",
      message: `Choose ${
        subdivisionLabel(input.countryCode) === "Emirate" ? "an emirate" : "a region"
      } from the list.`,
    };
  }

  if ((input.notes ?? "").length > ORG_NOTES_MAX) {
    return {
      field: "notes",
      message: `Keep the notes under ${ORG_NOTES_MAX} characters.`,
    };
  }

  return null;
}

/**
 * What actually changed, in words, for the audit trail and for the customer's
 * own timeline.
 *
 * Values are named, not printed: a note can run to two thousand characters and
 * an audit entry saying so is unreadable. The exception is the account name and
 * the TRN, both of which appear on documents the customer keeps, so the old and
 * new values are worth having in the record.
 */
export function organisationChanges(
  before: OrganisationInput,
  after: OrganisationInput
): string[] {
  const a = normaliseOrganisation(before);
  const b = normaliseOrganisation(after);
  const changes: string[] = [];

  if (a.name !== b.name) changes.push(`renamed from "${a.name}" to "${b.name}"`);
  if (a.trn !== b.trn) {
    changes.push(
      b.trn ? `TRN set to ${b.trn}` : "TRN removed"
    );
  }
  if (a.phone !== b.phone) changes.push(b.phone ? "phone updated" : "phone removed");
  if (a.countryCode !== b.countryCode) {
    changes.push(
      `country changed to ${countryByCode(b.countryCode)?.name ?? b.countryCode}`
    );
  }
  if (a.emirate !== b.emirate) {
    changes.push(b.emirate ? `region changed to ${b.emirate}` : "region removed");
  }
  if ((a.notes ?? "") !== (b.notes ?? "")) {
    changes.push(b.notes ? "notes updated" : "notes cleared");
  }
  if (a.isDisabled !== b.isDisabled) {
    changes.push(b.isDisabled ? "account disabled" : "account re-enabled");
  }

  return changes;
}

/** True when the change is one the customer sees on their own documents. */
export function isRename(
  before: OrganisationInput,
  after: OrganisationInput
): boolean {
  return normaliseOrganisation(before).name !== normaliseOrganisation(after).name;
}
