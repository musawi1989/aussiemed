/**
 * Countries, their subdivisions, and their dialling codes.
 *
 * Addresses were free text — a box labelled "Emirate" with "Dubai" as a
 * placeholder, and no country at all. That is fine while every customer is in
 * one country and every supplier is round the corner, and stops being fine the
 * moment a supplier is in Guangzhou or a clinic has a branch in Muscat. Free
 * text also means "Dubai", "dubai", "DXB" and "Dubaie" are four places, which
 * is discovered later, by whoever tries to group orders by region.
 *
 * TWO LISTS, DELIBERATELY DIFFERENT SIZES.
 *
 * Every country is here, because a country dropdown missing a country is a
 * form somebody cannot complete. That list is small — a name, two letters and
 * a dialling code each.
 *
 * Subdivisions are only for countries this business actually touches: the GCC,
 * and the places suppliers ship from. The full ISO 3166-2 set is several
 * thousand entries and would be shipped into every form that renders a country
 * picker, which is the mistake BE-47 was about. Countries without a list fall
 * back to a free-text box labelled with the right word for that country —
 * "State", "Province", "Region" — which is honest, and better than a dropdown
 * that half-knows somewhere.
 *
 * Pure. No imports at runtime.
 */

export type Country = {
  /** ISO 3166-1 alpha-2. What is stored. */
  code: string;
  name: string;
  /** International dialling prefix, with the plus. */
  dial: string;
};

/**
 * What a country calls the thing under it. Printing "State" on a UAE address
 * or "Emirate" on a German one is the sort of detail that tells a buyer how
 * much care went into the rest.
 */
export type SubdivisionLabel =
  | "Emirate"
  | "State"
  | "Province"
  | "Region"
  | "Governorate"
  | "County"
  | "Prefecture"
  | "Territory";

/* ------------------------------------------------------------------ *
 * Countries
 * ------------------------------------------------------------------ */

/**
 * The UAE first, then alphabetical.
 *
 * Not a styling choice: nearly every address entered here will be Emirati, and
 * a form whose commonest answer is 230 rows down is a form that gets the wrong
 * answer. The rest stay alphabetical because that is how people scan a list
 * they are hunting through.
 */
export const COUNTRIES: Country[] = [
  { code: "AE", name: "United Arab Emirates", dial: "+971" },
  { code: "AF", name: "Afghanistan", dial: "+93" },
  { code: "AL", name: "Albania", dial: "+355" },
  { code: "DZ", name: "Algeria", dial: "+213" },
  { code: "AO", name: "Angola", dial: "+244" },
  { code: "AR", name: "Argentina", dial: "+54" },
  { code: "AM", name: "Armenia", dial: "+374" },
  { code: "AU", name: "Australia", dial: "+61" },
  { code: "AT", name: "Austria", dial: "+43" },
  { code: "AZ", name: "Azerbaijan", dial: "+994" },
  { code: "BH", name: "Bahrain", dial: "+973" },
  { code: "BD", name: "Bangladesh", dial: "+880" },
  { code: "BY", name: "Belarus", dial: "+375" },
  { code: "BE", name: "Belgium", dial: "+32" },
  { code: "BJ", name: "Benin", dial: "+229" },
  { code: "BT", name: "Bhutan", dial: "+975" },
  { code: "BO", name: "Bolivia", dial: "+591" },
  { code: "BA", name: "Bosnia and Herzegovina", dial: "+387" },
  { code: "BW", name: "Botswana", dial: "+267" },
  { code: "BR", name: "Brazil", dial: "+55" },
  { code: "BN", name: "Brunei", dial: "+673" },
  { code: "BG", name: "Bulgaria", dial: "+359" },
  { code: "BF", name: "Burkina Faso", dial: "+226" },
  { code: "KH", name: "Cambodia", dial: "+855" },
  { code: "CM", name: "Cameroon", dial: "+237" },
  { code: "CA", name: "Canada", dial: "+1" },
  { code: "TD", name: "Chad", dial: "+235" },
  { code: "CL", name: "Chile", dial: "+56" },
  { code: "CN", name: "China", dial: "+86" },
  { code: "CO", name: "Colombia", dial: "+57" },
  { code: "CG", name: "Congo", dial: "+242" },
  { code: "CR", name: "Costa Rica", dial: "+506" },
  { code: "HR", name: "Croatia", dial: "+385" },
  { code: "CU", name: "Cuba", dial: "+53" },
  { code: "CY", name: "Cyprus", dial: "+357" },
  { code: "CZ", name: "Czechia", dial: "+420" },
  { code: "DK", name: "Denmark", dial: "+45" },
  { code: "DJ", name: "Djibouti", dial: "+253" },
  { code: "EC", name: "Ecuador", dial: "+593" },
  { code: "EG", name: "Egypt", dial: "+20" },
  { code: "SV", name: "El Salvador", dial: "+503" },
  { code: "EE", name: "Estonia", dial: "+372" },
  { code: "ET", name: "Ethiopia", dial: "+251" },
  { code: "FI", name: "Finland", dial: "+358" },
  { code: "FR", name: "France", dial: "+33" },
  { code: "GA", name: "Gabon", dial: "+241" },
  { code: "GE", name: "Georgia", dial: "+995" },
  { code: "DE", name: "Germany", dial: "+49" },
  { code: "GH", name: "Ghana", dial: "+233" },
  { code: "GR", name: "Greece", dial: "+30" },
  { code: "GT", name: "Guatemala", dial: "+502" },
  { code: "GN", name: "Guinea", dial: "+224" },
  { code: "HN", name: "Honduras", dial: "+504" },
  { code: "HK", name: "Hong Kong", dial: "+852" },
  { code: "HU", name: "Hungary", dial: "+36" },
  { code: "IS", name: "Iceland", dial: "+354" },
  { code: "IN", name: "India", dial: "+91" },
  { code: "ID", name: "Indonesia", dial: "+62" },
  { code: "IR", name: "Iran", dial: "+98" },
  { code: "IQ", name: "Iraq", dial: "+964" },
  { code: "IE", name: "Ireland", dial: "+353" },
  { code: "IL", name: "Israel", dial: "+972" },
  { code: "IT", name: "Italy", dial: "+39" },
  { code: "CI", name: "Ivory Coast", dial: "+225" },
  { code: "JM", name: "Jamaica", dial: "+1876" },
  { code: "JP", name: "Japan", dial: "+81" },
  { code: "JO", name: "Jordan", dial: "+962" },
  { code: "KZ", name: "Kazakhstan", dial: "+7" },
  { code: "KE", name: "Kenya", dial: "+254" },
  { code: "KW", name: "Kuwait", dial: "+965" },
  { code: "KG", name: "Kyrgyzstan", dial: "+996" },
  { code: "LA", name: "Laos", dial: "+856" },
  { code: "LV", name: "Latvia", dial: "+371" },
  { code: "LB", name: "Lebanon", dial: "+961" },
  { code: "LY", name: "Libya", dial: "+218" },
  { code: "LT", name: "Lithuania", dial: "+370" },
  { code: "LU", name: "Luxembourg", dial: "+352" },
  { code: "MG", name: "Madagascar", dial: "+261" },
  { code: "MW", name: "Malawi", dial: "+265" },
  { code: "MY", name: "Malaysia", dial: "+60" },
  { code: "MV", name: "Maldives", dial: "+960" },
  { code: "ML", name: "Mali", dial: "+223" },
  { code: "MT", name: "Malta", dial: "+356" },
  { code: "MR", name: "Mauritania", dial: "+222" },
  { code: "MU", name: "Mauritius", dial: "+230" },
  { code: "MX", name: "Mexico", dial: "+52" },
  { code: "MD", name: "Moldova", dial: "+373" },
  { code: "MN", name: "Mongolia", dial: "+976" },
  { code: "ME", name: "Montenegro", dial: "+382" },
  { code: "MA", name: "Morocco", dial: "+212" },
  { code: "MZ", name: "Mozambique", dial: "+258" },
  { code: "MM", name: "Myanmar", dial: "+95" },
  { code: "NA", name: "Namibia", dial: "+264" },
  { code: "NP", name: "Nepal", dial: "+977" },
  { code: "NL", name: "Netherlands", dial: "+31" },
  { code: "NZ", name: "New Zealand", dial: "+64" },
  { code: "NI", name: "Nicaragua", dial: "+505" },
  { code: "NE", name: "Niger", dial: "+227" },
  { code: "NG", name: "Nigeria", dial: "+234" },
  { code: "KP", name: "North Korea", dial: "+850" },
  { code: "MK", name: "North Macedonia", dial: "+389" },
  { code: "NO", name: "Norway", dial: "+47" },
  { code: "OM", name: "Oman", dial: "+968" },
  { code: "PK", name: "Pakistan", dial: "+92" },
  { code: "PS", name: "Palestine", dial: "+970" },
  { code: "PA", name: "Panama", dial: "+507" },
  { code: "PG", name: "Papua New Guinea", dial: "+675" },
  { code: "PY", name: "Paraguay", dial: "+595" },
  { code: "PE", name: "Peru", dial: "+51" },
  { code: "PH", name: "Philippines", dial: "+63" },
  { code: "PL", name: "Poland", dial: "+48" },
  { code: "PT", name: "Portugal", dial: "+351" },
  { code: "QA", name: "Qatar", dial: "+974" },
  { code: "RO", name: "Romania", dial: "+40" },
  { code: "RU", name: "Russia", dial: "+7" },
  { code: "RW", name: "Rwanda", dial: "+250" },
  { code: "SA", name: "Saudi Arabia", dial: "+966" },
  { code: "SN", name: "Senegal", dial: "+221" },
  { code: "RS", name: "Serbia", dial: "+381" },
  { code: "SG", name: "Singapore", dial: "+65" },
  { code: "SK", name: "Slovakia", dial: "+421" },
  { code: "SI", name: "Slovenia", dial: "+386" },
  { code: "SO", name: "Somalia", dial: "+252" },
  { code: "ZA", name: "South Africa", dial: "+27" },
  { code: "KR", name: "South Korea", dial: "+82" },
  { code: "SS", name: "South Sudan", dial: "+211" },
  { code: "ES", name: "Spain", dial: "+34" },
  { code: "LK", name: "Sri Lanka", dial: "+94" },
  { code: "SD", name: "Sudan", dial: "+249" },
  { code: "SE", name: "Sweden", dial: "+46" },
  { code: "CH", name: "Switzerland", dial: "+41" },
  { code: "SY", name: "Syria", dial: "+963" },
  { code: "TW", name: "Taiwan", dial: "+886" },
  { code: "TJ", name: "Tajikistan", dial: "+992" },
  { code: "TZ", name: "Tanzania", dial: "+255" },
  { code: "TH", name: "Thailand", dial: "+66" },
  { code: "TG", name: "Togo", dial: "+228" },
  { code: "TT", name: "Trinidad and Tobago", dial: "+1868" },
  { code: "TN", name: "Tunisia", dial: "+216" },
  { code: "TR", name: "Türkiye", dial: "+90" },
  { code: "TM", name: "Turkmenistan", dial: "+993" },
  { code: "UG", name: "Uganda", dial: "+256" },
  { code: "UA", name: "Ukraine", dial: "+380" },
  { code: "GB", name: "United Kingdom", dial: "+44" },
  { code: "US", name: "United States", dial: "+1" },
  { code: "UY", name: "Uruguay", dial: "+598" },
  { code: "UZ", name: "Uzbekistan", dial: "+998" },
  { code: "VE", name: "Venezuela", dial: "+58" },
  { code: "VN", name: "Vietnam", dial: "+84" },
  { code: "YE", name: "Yemen", dial: "+967" },
  { code: "ZM", name: "Zambia", dial: "+260" },
  { code: "ZW", name: "Zimbabwe", dial: "+263" },
];

/** Where an address is assumed to be until told otherwise. */
export const DEFAULT_COUNTRY = "AE";

/* ------------------------------------------------------------------ *
 * Subdivisions
 * ------------------------------------------------------------------ */

type SubdivisionSet = { label: SubdivisionLabel; items: string[] };

/**
 * Only where it earns its place: the GCC, because that is the market, and the
 * countries goods are bought from. Everywhere else gets a free-text box with
 * the right word on it.
 */
const SUBDIVISIONS: Record<string, SubdivisionSet> = {
  AE: {
    label: "Emirate",
    items: [
      "Abu Dhabi",
      "Dubai",
      "Sharjah",
      "Ajman",
      "Umm Al Quwain",
      "Ras Al Khaimah",
      "Fujairah",
    ],
  },
  SA: {
    label: "Region",
    items: [
      "Riyadh", "Makkah", "Madinah", "Eastern Province", "Asir", "Tabuk",
      "Hail", "Northern Borders", "Jazan", "Najran", "Al Bahah", "Al Jawf",
      "Qassim",
    ],
  },
  OM: {
    label: "Governorate",
    items: [
      "Muscat", "Dhofar", "Musandam", "Al Buraimi", "Ad Dakhiliyah",
      "Al Batinah North", "Al Batinah South", "Ash Sharqiyah North",
      "Ash Sharqiyah South", "Adh Dhahirah", "Al Wusta",
    ],
  },
  QA: {
    label: "Governorate",
    items: [
      "Doha", "Al Rayyan", "Al Wakrah", "Al Khor", "Al Shamal", "Al Daayen",
      "Umm Salal", "Al Shahaniya",
    ],
  },
  KW: {
    label: "Governorate",
    items: [
      "Al Asimah", "Hawalli", "Farwaniya", "Mubarak Al-Kabeer", "Ahmadi",
      "Jahra",
    ],
  },
  BH: {
    label: "Governorate",
    items: ["Capital", "Muharraq", "Northern", "Southern"],
  },
  IN: {
    label: "State",
    items: [
      "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
      "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
      "Jammu and Kashmir", "Karnataka", "Kerala", "Madhya Pradesh",
      "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
      "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
      "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    ],
  },
  CN: {
    label: "Province",
    items: [
      "Anhui", "Beijing", "Chongqing", "Fujian", "Gansu", "Guangdong",
      "Guangxi", "Guizhou", "Hainan", "Hebei", "Heilongjiang", "Henan",
      "Hubei", "Hunan", "Inner Mongolia", "Jiangsu", "Jiangxi", "Jilin",
      "Liaoning", "Ningxia", "Qinghai", "Shaanxi", "Shandong", "Shanghai",
      "Shanxi", "Sichuan", "Tianjin", "Tibet", "Xinjiang", "Yunnan",
      "Zhejiang",
    ],
  },
  PK: {
    label: "Province",
    items: [
      "Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad",
      "Gilgit-Baltistan", "Azad Kashmir",
    ],
  },
  AU: {
    label: "State",
    items: [
      "Australian Capital Territory", "New South Wales", "Northern Territory",
      "Queensland", "South Australia", "Tasmania", "Victoria",
      "Western Australia",
    ],
  },
  GB: {
    label: "County",
    items: ["England", "Scotland", "Wales", "Northern Ireland"],
  },
  US: {
    label: "State",
    items: [
      "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
      "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
      "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
      "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
      "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
      "New Hampshire", "New Jersey", "New Mexico", "New York",
      "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
      "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
      "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
      "West Virginia", "Wisconsin", "Wyoming",
    ],
  },
  DE: {
    label: "State",
    items: [
      "Baden-Württemberg", "Bavaria", "Berlin", "Brandenburg", "Bremen",
      "Hamburg", "Hesse", "Lower Saxony", "Mecklenburg-Vorpommern",
      "North Rhine-Westphalia", "Rhineland-Palatinate", "Saarland", "Saxony",
      "Saxony-Anhalt", "Schleswig-Holstein", "Thuringia",
    ],
  },
  EG: {
    label: "Governorate",
    items: [
      "Cairo", "Giza", "Alexandria", "Dakahlia", "Red Sea", "Beheira",
      "Fayoum", "Gharbia", "Ismailia", "Menofia", "Minya", "Qalyubia",
      "New Valley", "Suez", "Aswan", "Assiut", "Beni Suef", "Port Said",
      "Damietta", "Sharkia", "South Sinai", "Kafr El Sheikh", "Matrouh",
      "Luxor", "Qena", "North Sinai", "Sohag",
    ],
  },
  JO: {
    label: "Governorate",
    items: [
      "Amman", "Irbid", "Zarqa", "Balqa", "Mafraq", "Karak", "Jerash",
      "Madaba", "Ajloun", "Aqaba", "Maan", "Tafilah",
    ],
  },
  TR: {
    label: "Province",
    items: [
      "Istanbul", "Ankara", "Izmir", "Bursa", "Antalya", "Adana", "Konya",
      "Gaziantep", "Mersin", "Kayseri", "Kocaeli", "Samsun", "Denizli",
      "Eskisehir", "Trabzon",
    ],
  },
  MY: {
    label: "State",
    items: [
      "Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Labuan", "Malacca",
      "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis", "Putrajaya",
      "Sabah", "Sarawak", "Selangor", "Terengganu",
    ],
  },
};

/** When a country has no list, this is what its subdivision is called. */
const DEFAULT_LABEL: SubdivisionLabel = "State";

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countryByCode(code: string | null | undefined): Country | null {
  if (!code) return null;
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

export function countryName(code: string | null | undefined): string | null {
  return countryByCode(code)?.name ?? null;
}

/**
 * The dialling code, so a phone box can show "+971" beside it rather than
 * leaving somebody to remember it. Returns null rather than a guess for a
 * country we do not hold — a wrong prefix on a delivery contact is a driver
 * who cannot ring ahead.
 */
export function dialCode(code: string | null | undefined): string | null {
  return countryByCode(code)?.dial ?? null;
}

export function subdivisionsOf(code: string | null | undefined): string[] {
  const set = SUBDIVISIONS[(code ?? "").trim().toUpperCase()];
  return set ? [...set.items] : [];
}

export function subdivisionLabel(code: string | null | undefined): SubdivisionLabel {
  return SUBDIVISIONS[(code ?? "").trim().toUpperCase()]?.label ?? DEFAULT_LABEL;
}

/** Whether this country offers a list, or wants a free-text box. */
export function hasSubdivisions(code: string | null | undefined): boolean {
  return subdivisionsOf(code).length > 0;
}

/**
 * Matching a typed subdivision against the list.
 *
 * The existing data is free text — "dubai", "Dubai", "DUBAI" — and none of it
 * should be thrown away when these forms start using a dropdown. Case and
 * spacing are ignored; anything unrecognised is returned as it was rather than
 * blanked, because a value we cannot match is still what somebody wrote and
 * still gets a parcel delivered.
 */
export function matchSubdivision(
  countryCode: string | null | undefined,
  typed: string | null | undefined
): string | null {
  const value = (typed ?? "").trim();
  if (!value) return null;

  const found = subdivisionsOf(countryCode).find(
    (item) => item.toLowerCase() === value.toLowerCase()
  );
  return found ?? value;
}

/* ------------------------------------------------------------------ *
 * Phone numbers
 * ------------------------------------------------------------------ */

/**
 * Joining a dialling code to a number somebody typed.
 *
 * People type the national number three ways — "050 123 4567", "50 123 4567"
 * and "+971 50 123 4567" — and all three mean the same phone. The leading zero
 * is a domestic convention and is dropped when a country code is put in front
 * of it: "+971 050..." is not a number anyone can ring, and it is exactly what
 * you get by concatenating the two halves without thinking.
 */
export function joinPhone(
  dial: string | null | undefined,
  national: string | null | undefined
): string {
  const typed = (national ?? "").trim();
  if (!typed) return "";

  // Already international: they pasted the whole thing, so leave it alone
  // beyond tidying the spacing.
  if (typed.startsWith("+")) return typed.replace(/\s+/g, " ");

  const prefix = (dial ?? "").trim();
  if (!prefix) return typed;

  const digits = typed.replace(/[^\d]/g, "").replace(/^0+/, "");
  return digits ? `${prefix} ${digits}` : "";
}

/**
 * Some dialling codes belong to several countries, and the number alone cannot
 * say which.
 *
 * +1 is the whole North American plan — the United States, Canada and twenty
 * Caribbean nations — and +7 covers Russia and Kazakhstan. Telling them apart
 * needs area-code tables this does not carry and does not need. What it must
 * not do is answer differently depending on where a country happens to sit in
 * an alphabetical list, so the choice is written down: the largest holder of
 * the code, which is the likeliest right answer and, more importantly, always
 * the same answer.
 *
 * This only affects which country an edit form opens on. The stored number is
 * unchanged either way, and a person can correct the dropdown in one click.
 */
const SHARED_DIAL_PRIMARY: Record<string, string> = {
  "+1": "US",
  "+7": "RU",
};

/**
 * Splitting a stored number back into a country and the rest, so an edit form
 * can show the dropdown already on the right country instead of making
 * somebody set it again.
 *
 * Longest prefix wins: +1 and +1876 both match a Jamaican number, and the
 * specific one is the true one.
 */
export function splitPhone(stored: string | null | undefined): {
  countryCode: string | null;
  national: string;
} {
  const value = (stored ?? "").trim();
  if (!value.startsWith("+")) return { countryCode: null, national: value };

  const compact = value.replace(/\s+/g, "");
  let best: Country | null = null;
  for (const country of COUNTRIES) {
    if (!compact.startsWith(country.dial)) continue;
    if (!best || country.dial.length > best.dial.length) best = country;
  }

  if (!best) return { countryCode: null, national: value };

  // A tie on length means a shared code, which is decided rather than left to
  // whoever sorts first.
  const primary = SHARED_DIAL_PRIMARY[best.dial];
  const chosen = primary ? (countryByCode(primary) ?? best) : best;

  return {
    countryCode: chosen.code,
    national: compact.slice(chosen.dial.length),
  };
}

/* ------------------------------------------------------------------ *
 * Reading a country, a subdivision and a phone off a form
 * ------------------------------------------------------------------ *
 *
 * Four forms ask for these — a branch, a supplier, a delivery address at
 * checkout, and a customer once that form exists. Each reading them for itself
 * is how four subtly different ideas of an address arise, and the differences
 * only surface later, to whoever tries to group orders by region.
 *
 * Here rather than in a module of its own because a pure module may not import
 * another at runtime — the test runner resolves nothing — and this is a dozen
 * lines that belong beside the tables they read.
 */

export type AddressParts = {
  /** ISO 3166-1 alpha-2, always a country we hold. */
  countryCode: string;
  /** The display name, for printing on a document. */
  country: string;
  /** The subdivision, matched to the country's list where there is one. */
  emirate: string;
  /** Joined and stored international, e.g. "+971 501234567". */
  phone: string;
};

export type RawAddressInput = {
  countryCode?: string | null;
  emirate?: string | null;
  /** The local number as typed, without the country's dialling code. */
  phoneNational?: string | null;
  /** A number already stored or pasted whole. Used when there is no national. */
  phone?: string | null;
};

/**
 * An unrecognised country falls back to the default rather than being stored
 * as typed. Anything else means a row whose country is "XX" or "" — invisible
 * on every screen, and wrong in every report that groups by it.
 */
export function readAddressParts(input: RawAddressInput): AddressParts {
  const country =
    countryByCode(input.countryCode) ?? countryByCode(DEFAULT_COUNTRY)!;

  // Prefer the split fields; fall back to a whole number for callers that
  // still post one, so an older client or an API caller is not broken.
  const national = (input.phoneNational ?? "").trim();
  const phone = national
    ? joinPhone(dialCode(country.code), national)
    : joinPhone(dialCode(country.code), input.phone ?? "");

  return {
    countryCode: country.code,
    country: country.name,
    emirate: matchSubdivision(country.code, input.emirate) ?? "",
    phone,
  };
}

/** The same, read straight off a FormData. */
export function addressPartsFrom(
  data: {
    get(key: string): FormDataEntryValue | null;
  },
  prefix = ""
): AddressParts {
  const text = (key: string) => {
    const value = data.get(prefix ? `${prefix}${key}` : key);
    return typeof value === "string" ? value : null;
  };

  return readAddressParts({
    countryCode: text("countryCode"),
    emirate: text("emirate"),
    phoneNational: text("phoneNational"),
    phone: text("phone"),
  });
}
