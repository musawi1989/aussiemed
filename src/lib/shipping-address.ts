/**
 * The delivery address as it was given when the order was placed.
 *
 * It is stored as JSON on the order so that editing an address book entry
 * later cannot alter where a historical order was sent. That storage choice
 * had leaked into the interface: the admin order screen and the delivery note
 * both printed the raw string, so staff — and any customer receiving a
 * delivery note — were shown `{"company":"...","line1":"..."}`.
 *
 * Parsing lives here rather than in each page so the three places that display
 * an address cannot drift apart, and so a snapshot written by an older version
 * of checkout, or corrupted, degrades to "not recorded" instead of throwing on
 * a page someone needs.
 */
export type ShippingAddress = {
  company: string | null;
  contact: string | null;
  email: string | null;
  phone: string | null;
  line1: string | null;
  emirate: string | null;
};

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseShippingAddress(
  snapshot: string | null
): ShippingAddress | null {
  if (!snapshot) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(snapshot);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;

  const record = raw as Record<string, unknown>;
  const address: ShippingAddress = {
    company: text(record.company),
    contact: text(record.contact),
    email: text(record.email),
    phone: text(record.phone),
    line1: text(record.line1),
    emirate: text(record.emirate),
  };

  // An object that parsed but held nothing useful is the same as no address.
  return Object.values(address).some(Boolean) ? address : null;
}

/**
 * The address as lines, ready to print. The emirate is title-cased because
 * checkout stores what the select gave it — "dubai" on a delivery note reads
 * as a mistake rather than a place.
 */
export function addressLines(address: ShippingAddress): string[] {
  const place = [address.line1, titleCase(address.emirate)]
    .filter(Boolean)
    .join(", ");

  return [address.company, address.contact, place, address.phone].filter(
    (line): line is string => Boolean(line)
  );
}

function titleCase(value: string | null): string | null {
  if (!value) return null;
  return value
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
