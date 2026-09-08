/**
 * What a supplier is allowed to do, as data rather than as scattered rules.
 *
 * Ten things a supplier could do in the portal. Nine of them were decided in
 * code — a hardcoded refusal, or nothing at all — and one was a checkbox on
 * Settings. Between them there was no single place to answer "what can a
 * supplier actually do without us?", which is the question this file exists to
 * make answerable.
 *
 * PURE ON PURPOSE. The admin panel is a client component and the enforcement
 * is server-only; both need these definitions, and a `server-only` import in a
 * client component is a build error. Labels, modes and defaults live here;
 * reading and writing them lives in permissions.ts.
 *
 * THE DEFAULTS ARE NOT A DESIGN — THEY ARE A RECORDING. Every default below is
 * what the code already did before this file existed, so installing the panel
 * changes nothing until somebody moves a switch. A permissions screen that
 * silently alters behaviour on the day it ships is one nobody can trust
 * afterwards.
 */

/**
 * Off: the portal will not offer it and the server refuses it.
 * Approval: they can do it, and it waits for us.
 * Allowed: they can do it, and it takes effect.
 *
 * Not every capability has a sensible middle. "Acknowledge a purchase order"
 * either is their job or is not; an acknowledgement held for approval is a
 * message we have already read, sitting in a queue.
 */
export type PermissionMode = "off" | "approval" | "allowed";

export type PermissionDef = {
  key: string;
  label: string;
  /** What it means in the supplier's terms, not ours. */
  note: string;
  /** Where in the portal it takes effect, so the panel can be checked. */
  where: string;
  modes: PermissionMode[];
  default: PermissionMode;
  /** Said plainly on the panel when the consequence is not obvious. */
  warning?: string;
};

export type PermissionGroup = {
  heading: string;
  note: string;
  permissions: PermissionDef[];
};

export const SUPPLIER_PERMISSIONS: PermissionGroup[] = [
  {
    heading: "Their list of items",
    note: "What a supplier tells us they can send. None of this decides who receives a purchase order — that stays on Suppliers, Cover.",
    permissions: [
      {
        key: "addItems",
        label: "Add items to their list",
        note: "Browse the catalogue and tell us they stock something.",
        where: "Business portal, What you supply, Add items",
        modes: ["off", "approval", "allowed"],
        // Was the one existing switch, and off — additions landed immediately.
        default: "allowed",
      },
      {
        key: "removeOffers",
        label: "Remove an item they offered",
        note: "Take something back off their own list.",
        where: "Business portal, What you supply, Remove",
        modes: ["off", "allowed"],
        default: "allowed",
        warning:
          "Cover we agreed is never removable from their side, whatever this is set to. Dropping a primary or backup would take a line out of the buying run with nothing said to anybody here, so it comes off on the Cover screen, by us.",
      },
      {
        key: "changePrice",
        label: "Change what we pay them",
        note: "Put a new cost against an item.",
        where: "Business portal, What you supply, Edit, Cost",
        modes: ["off", "approval", "allowed"],
        // What the code did: every submitted cost became a request.
        default: "approval",
        warning:
          "On Allowed a supplier reprices their own goods and the next purchase order pays it. Nothing on the buying run asks a second time.",
      },
      {
        key: "editTerms",
        label: "Edit their part number and lead time",
        note: "What they call the item, and how long it takes to arrive.",
        where: "Business portal, What you supply, Edit",
        modes: ["off", "allowed"],
        default: "allowed",
      },
    ],
  },
  {
    heading: "Availability",
    note: "How a supplier tells us they cannot send something. Both of these move work to the backup supplier rather than stopping it.",
    permissions: [
      {
        key: "markOutOfStock",
        label: "Mark an item out of stock",
        note: "One item they cannot currently send.",
        where: "Business portal, What you supply, In stock and Out of stock",
        modes: ["off", "allowed"],
        default: "allowed",
      },
      {
        key: "suggestAlternative",
        label: "Suggest an alternative",
        note: "Point at another item when they cannot supply.",
        where: "Business portal, What you supply, Edit, Alternative",
        modes: ["off", "allowed"],
        default: "allowed",
        warning:
          "A suggestion is advice beside the line and changes nothing about what is ordered. It is never acted on without somebody here choosing it.",
      },
      {
        key: "pauseAccount",
        label: "Turn their whole account off",
        note: "They cannot supply anything at the moment.",
        where: "Business portal, What you supply, Availability",
        modes: ["off", "allowed"],
        default: "allowed",
        warning:
          "Taking this away does not make a supplier able to supply. It makes them ring us instead, and the buying run keeps sending them orders until somebody answers.",
      },
    ],
  },
  {
    heading: "Purchase orders",
    note: "What a supplier does with an order once we have sent it.",
    permissions: [
      {
        key: "acknowledgeOrders",
        label: "Acknowledge an order",
        note: "Confirm they have received it and will fulfil it.",
        where: "Business portal, Purchase orders, Acknowledge",
        modes: ["off", "allowed"],
        default: "allowed",
      },
      {
        key: "confirmQuantities",
        label: "Confirm what they can send",
        note: "Say how much of each line is actually coming.",
        where: "Business portal, Purchase orders, Confirm quantities",
        modes: ["off", "allowed"],
        default: "allowed",
        warning:
          "Turning this off means we find out what is short when it arrives, rather than before it ships.",
      },
      {
        key: "markDispatched",
        label: "Mark despatched and add tracking",
        note: "Tell us it has left, with a courier and a tracking number.",
        where: "Business portal, Purchase orders, Despatch",
        modes: ["off", "allowed"],
        default: "allowed",
      },
    ],
  },
];

/** Flat, for lookups. */
export const ALL_SUPPLIER_PERMISSIONS: PermissionDef[] =
  SUPPLIER_PERMISSIONS.flatMap((group) => group.permissions);

/** A permission map with every key present, so callers never handle undefined. */
export type PermissionMap = Record<string, PermissionMode>;

/**
 * Namespaced, because Setting is one flat table shared with VAT rates and
 * courier lists, and a key called "addItems" would be a collision waiting to
 * happen.
 */
export function permissionSettingKey(key: string): string {
  return `perm.supplier.${key}`;
}

export function findPermission(key: string): PermissionDef | undefined {
  return ALL_SUPPLIER_PERMISSIONS.find((p) => p.key === key);
}

/**
 * A stored value, or the default if it is missing or nonsense.
 *
 * Unrecognised values fall back rather than throwing. A permission row that
 * somebody typed by hand, or that survives a rename, must not take the whole
 * supplier portal down — and falling back to the default is the conservative
 * reading in both directions, because the defaults are what the code did
 * before any of this existed.
 */
export function resolveMode(
  definition: PermissionDef,
  stored: string | null | undefined
): PermissionMode {
  if (stored && definition.modes.includes(stored as PermissionMode)) {
    return stored as PermissionMode;
  }
  return definition.default;
}

export const MODE_LABELS: Record<PermissionMode, string> = {
  off: "Not allowed",
  approval: "Needs approval",
  allowed: "Allowed",
};

export const MODE_NOTES: Record<PermissionMode, string> = {
  off: "The portal does not offer it and the server refuses it.",
  approval: "They can ask. It waits for somebody here.",
  allowed: "They do it themselves and it takes effect.",
};

/** True where the panel should say something differs from how it shipped. */
export function isChangedFromDefault(
  definition: PermissionDef,
  mode: PermissionMode
): boolean {
  return mode !== definition.default;
}

/**
 * What a supplier may write to one of their own supply rows.
 *
 * TWO PATHS WRITE THESE FIELDS — the row form and the spreadsheet upload — and
 * they were gating them separately, which is the arrangement where one gets a
 * new rule and the other does not. The rule now lives here once, and both ask
 * it the same question.
 *
 * Note `price` is three-valued rather than a boolean. "May they change the
 * price" has three answers, and the one in the middle — they may ask — is the
 * default, so a boolean would have had to pick a side and be wrong either way.
 */
export type WritableSupplyFields = {
  /** Their part number and lead time. */
  terms: boolean;
  /** no: ignore what was submitted. request: raise it. agree: apply it. */
  price: "no" | "request" | "agree";
  /** In stock or out of stock. */
  stock: boolean;
  /** Their suggested replacement, which only means anything while out. */
  alternative: boolean;
};

export function writableSupplyFields(perms: PermissionMap): WritableSupplyFields {
  const stock = perms.markOutOfStock !== "off";

  return {
    terms: perms.editTerms !== "off",
    price:
      perms.changePrice === "off"
        ? "no"
        : perms.changePrice === "allowed"
          ? "agree"
          : "request",
    stock,
    /*
     * An alternative rides on the stock state.
     *
     * It is only ever offered beside "we cannot supply this", and it is
     * cleared when they say they can again. A supplier who may not say they
     * are out of stock has no moment in which to suggest anything, so
     * permitting it on its own would be permitting nothing.
     */
    alternative: stock && perms.suggestAlternative !== "off",
  };
}
