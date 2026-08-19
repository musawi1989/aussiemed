/**
 * Who the buyer is, as a way into a catalogue of 2,057 products — FE-44.
 *
 * The client supplied the list of trades they sell to, with codes. A dental
 * clinic and a café buy from almost disjoint halves of this catalogue, and
 * neither wants to start at "Medical Consumables" and work it out.
 *
 * WHAT EACH TRADE BUYS IS OUR FIRST PASS, NOT THEIRS. The client gave the
 * types; the departments beneath each one were mapped here by reasoning about
 * the trade, and every line of it is a guess a person who sells to these
 * businesses should correct. It is in one table, pure and tested, precisely so
 * correcting it is editing a list rather than hunting through screens.
 *
 * Two are deliberately unfiltered rather than mapped: a general business has no
 * curation by definition, and a hospital buys across the whole catalogue. Both
 * show everything, which is an honest answer rather than a missing one.
 *
 * The codes are the client's own (BT-MED, BT-DEN …) and are what travels in the
 * URL, so a link survives any renaming of the label. Office & Facility arrived
 * without a code; BT-OFF follows the pattern and should be confirmed.
 */

export type BusinessType = {
  /** The client's code. Used in the URL, so labels can change freely. */
  code: string;
  label: string;
  /**
   * Department slugs this trade buys from. Empty means no narrowing at all —
   * the whole catalogue — rather than "nothing matches".
   */
  departments: string[];
};

export const BUSINESS_TYPES: BusinessType[] = [
  {
    code: "BT-MED",
    label: "Medical Clinic",
    departments: [
      "medical-consumables",
      "instruments-and-diagnostics",
      "wound-care-first-aid-and-safety",
      "nursing-and-patient-care",
      "protective-wear-ppe",
      "cleaning-and-hygiene",
    ],
  },
  {
    code: "BT-DEN",
    label: "Dental Clinic",
    departments: ["dental", "protective-wear-ppe", "cleaning-and-hygiene"],
  },
  {
    code: "BT-VET",
    label: "Veterinary Clinic",
    departments: [
      "pet-care",
      "medical-consumables",
      "instruments-and-diagnostics",
      "wound-care-first-aid-and-safety",
      "protective-wear-ppe",
      "cleaning-and-hygiene",
    ],
  },
  {
    code: "BT-AES",
    label: "Aesthetic & Skin Clinic",
    departments: [
      "beauty-skin-and-personal-care",
      "medical-consumables",
      "protective-wear-ppe",
      "cleaning-and-hygiene",
    ],
  },
  {
    // No curation by definition — the fallback so nobody is blocked.
    code: "BT-GEN",
    label: "General Business",
    departments: [],
  },
  {
    code: "BT-PHM",
    label: "Pharmacy",
    departments: [
      "medical-consumables",
      "wound-care-first-aid-and-safety",
      "beauty-skin-and-personal-care",
      "cleaning-and-hygiene",
    ],
  },
  {
    code: "BT-SAL",
    label: "Salon & Spa",
    departments: [
      "beauty-skin-and-personal-care",
      "cleaning-and-hygiene",
      "protective-wear-ppe",
    ],
  },
  {
    code: "BT-GYM",
    label: "Gym & Fitness",
    departments: [
      "cleaning-and-hygiene",
      "wound-care-first-aid-and-safety",
      "protective-wear-ppe",
    ],
  },
  {
    code: "BT-PHY",
    label: "Physiotherapy & Rehab",
    departments: [
      "medical-consumables",
      "wound-care-first-aid-and-safety",
      "instruments-and-diagnostics",
      "cleaning-and-hygiene",
    ],
  },
  {
    code: "BT-HHC",
    label: "Home Healthcare",
    departments: [
      "nursing-and-patient-care",
      "medical-consumables",
      "wound-care-first-aid-and-safety",
      "protective-wear-ppe",
      "cleaning-and-hygiene",
    ],
  },
  {
    code: "BT-EDU",
    label: "Nursery & School",
    departments: [
      "wound-care-first-aid-and-safety",
      "cleaning-and-hygiene",
      "office-and-stationery-supplies",
      "kitchen",
    ],
  },
  {
    code: "BT-LAB",
    label: "Diagnostic Lab",
    departments: [
      "laboratory",
      "medical-consumables",
      "protective-wear-ppe",
      "cleaning-and-hygiene",
    ],
  },
  {
    code: "BT-FNB",
    label: "Restaurant & Café",
    departments: ["kitchen", "cleaning-and-hygiene", "protective-wear-ppe"],
  },
  {
    code: "BT-OPT",
    label: "Optical Centre",
    departments: [
      "instruments-and-diagnostics",
      "medical-consumables",
      "cleaning-and-hygiene",
    ],
  },
  {
    code: "BT-ALT",
    label: "Alternative Medicine",
    departments: [
      "medical-consumables",
      "wound-care-first-aid-and-safety",
      "cleaning-and-hygiene",
    ],
  },
  {
    // Buys across the entire catalogue, so nothing is narrowed.
    code: "BT-HOS",
    label: "Hospital & Day Surgery",
    departments: [],
  },
  {
    code: "BT-HTL",
    label: "Hotel & Hospitality",
    departments: [
      "cleaning-and-hygiene",
      "kitchen",
      "beauty-skin-and-personal-care",
      "office-and-stationery-supplies",
    ],
  },
  {
    // BT-OFF is ours: the client's list gave this one no code.
    code: "BT-OFF",
    label: "Office & Facility",
    departments: [
      "office-and-stationery-supplies",
      "cleaning-and-hygiene",
      "kitchen",
      "wound-care-first-aid-and-safety",
    ],
  },
];

export function businessTypeByCode(code: string | undefined): BusinessType | undefined {
  if (!code) return undefined;
  const wanted = code.trim().toUpperCase();
  return BUSINESS_TYPES.find((type) => type.code === wanted);
}

/**
 * The departments a chosen trade shops in, or undefined for no narrowing —
 * which covers both an unknown code and the trades that buy everything.
 *
 * Undefined and an empty array are deliberately different things upstream: one
 * means "do not filter", the other would mean "match nothing", and confusing
 * them is how a filter silently empties a catalogue.
 */
export function departmentsFor(code: string | undefined): string[] | undefined {
  const type = businessTypeByCode(code);
  if (!type || type.departments.length === 0) return undefined;
  return type.departments;
}
