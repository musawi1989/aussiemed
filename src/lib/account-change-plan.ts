/**
 * The rules about changing an account: what needs a reason, what needs
 * approval, and what each change is called once it has been made.
 *
 * No database access, so the customer's forms, the customer's timeline and
 * the admin's queue all read one set of rules rather than three drifting
 * copies — and so the rules themselves can be tested without a database.
 */

export const CHANGE_KINDS = [
  "StaffAdded",
  "StaffRemoved",
  "BranchAdded",
  "BranchEdited",
  "BranchRemoved",
  "AccountRenamed",
] as const;

export type ChangeKind = (typeof CHANGE_KINDS)[number];

export const CHANGE_STATUSES = [
  "Applied",
  "Pending",
  "Approved",
  "Rejected",
] as const;

export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

/**
 * Which changes an account can simply make, and which wait for us.
 *
 * The staff list is a record of who at the practice asked for what. It is
 * theirs, it affects nothing outside their own account, and holding "Dr Haddad
 * has left" for approval would mean an order going out in the name of someone
 * who no longer works there.
 *
 * Everything else moves where goods are delivered or what name goes on an
 * invoice, and both of those are ours to get wrong. A new branch is a new
 * address to ship medical supplies to; a renamed account is a different name
 * on a tax invoice. Those are checked before they take effect.
 */
const NEEDS_APPROVAL: Record<ChangeKind, boolean> = {
  StaffAdded: false,
  StaffRemoved: false,
  BranchAdded: true,
  BranchEdited: true,
  BranchRemoved: true,
  AccountRenamed: true,
};

export function needsApproval(kind: ChangeKind): boolean {
  return NEEDS_APPROVAL[kind] ?? true;
}

/** Where a change of this kind starts life. */
export function initialStatus(kind: ChangeKind): ChangeStatus {
  return needsApproval(kind) ? "Pending" : "Applied";
}

export function isChangeKind(value: string): value is ChangeKind {
  return (CHANGE_KINDS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ *
 * Reasons
 * ------------------------------------------------------------------ */

/**
 * Long enough to be a reason and not a keystroke.
 *
 * Ten characters is deliberately low. The aim is a note that means something
 * to whoever reads the log in six months, and a longer minimum does not
 * produce that — it produces "aaaaaaaaaaaa". What it does stop is the empty
 * submit and the single full stop.
 */
export const REASON_MIN = 10;
export const REASON_MAX = 500;

export type ReasonCheck = { ok: true; reason: string } | { ok: false; error: string };

export function checkReason(raw: string | null | undefined): ReasonCheck {
  const reason = (raw ?? "").trim().replace(/\s+/g, " ");

  if (!reason) {
    return { ok: false, error: "Please say why this change is being made." };
  }
  if (reason.length < REASON_MIN) {
    return {
      ok: false,
      error: `That is a little short — say why in a few words (at least ${REASON_MIN} characters).`,
    };
  }
  if (reason.length > REASON_MAX) {
    return {
      ok: false,
      error: `Please keep the reason under ${REASON_MAX} characters.`,
    };
  }
  return { ok: true, reason };
}

/* ------------------------------------------------------------------ *
 * Wording
 * ------------------------------------------------------------------ */

/** The one-line description that goes on the timeline. */
export function summarise(kind: ChangeKind, subject: string): string {
  const name = subject.trim() || "an entry";
  switch (kind) {
    case "StaffAdded":
      return `Added ${name} to who orders`;
    case "StaffRemoved":
      return `Removed ${name} from who orders`;
    case "BranchAdded":
      return `Add branch ${name}`;
    case "BranchEdited":
      return `Update branch ${name}`;
    case "BranchRemoved":
      return `Remove branch ${name}`;
    case "AccountRenamed":
      return `Change the account name to ${name}`;
  }
}

/**
 * What the customer is told the state of a change is.
 *
 * "Applied" is a developer's word. The customer wants to know whether the
 * thing they asked for has happened, is waiting on us, or was turned down.
 */
export function statusLabel(status: string): string {
  switch (status) {
    case "Applied":
      return "Done";
    case "Pending":
      return "Waiting for approval";
    case "Approved":
      return "Approved";
    case "Rejected":
      return "Not approved";
    default:
      return status;
  }
}

/**
 * Whether a change of this status has taken effect on the account.
 *
 * Approved and Applied both have; Pending has not, and Rejected never will.
 * Used to decide whether a branch shows its current details or a note saying
 * an edit is waiting.
 */
export function hasTakenEffect(status: string): boolean {
  return status === "Applied" || status === "Approved";
}

/* ------------------------------------------------------------------ *
 * Branch details held for approval
 * ------------------------------------------------------------------ */

export type BranchPayload = {
  label: string;
  contact: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  /** The subdivision. Called Emirate here for the column it is stored in. */
  emirate: string;
  /**
   * Two fields for one fact, on purpose.
   *
   * `country` is the printable name and is what a reviewer approving a change
   * reads — "Country: United Arab Emirates → Oman" means something, where
   * "AE → OM" is a puzzle. `countryCode` is what gets stored and grouped by.
   * Only the name appears in the diff below; the code travels with it.
   */
  country: string;
  countryCode: string;
};

const BRANCH_FIELDS: { key: keyof BranchPayload; label: string; required: boolean }[] = [
  { key: "label", label: "Branch name", required: true },
  { key: "contact", label: "Who takes delivery", required: true },
  { key: "phone", label: "Phone", required: false },
  { key: "line1", label: "Address", required: true },
  { key: "line2", label: "Unit or floor", required: false },
  { key: "city", label: "City", required: true },
  // "Region" rather than "Emirate": this label goes into the sentence a
  // reviewer reads on an approval, and a branch in Muscat changing its
  // "Emirate" reads as a mistake in our software rather than a change to
  // theirs. The form above the box still says the right word per country.
  { key: "emirate", label: "Region", required: false },
  { key: "country", label: "Country", required: false },
];

export type BranchCheck =
  | { ok: true; branch: BranchPayload }
  | { ok: false; error: string };

export function checkBranch(input: Partial<Record<keyof BranchPayload, string>>): BranchCheck {
  const branch = {} as BranchPayload;

  for (const field of BRANCH_FIELDS) {
    const value = (input[field.key] ?? "").trim().replace(/\s+/g, " ");
    if (field.required && !value) {
      return { ok: false, error: `${field.label} is needed.` };
    }
    branch[field.key] = value;
  }

  return { ok: true, branch };
}

/**
 * What an admin is shown to review: the fields that actually differ.
 *
 * A reviewer approving a change to a phone number should not have to read
 * seven unchanged address lines to find it. With no previous version — a new
 * branch — every filled field is a change, because all of it is new.
 */
export type FieldChange = { label: string; from: string; to: string };

export function branchDiff(
  before: Partial<BranchPayload> | null,
  after: BranchPayload
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const field of BRANCH_FIELDS) {
    const to = after[field.key] ?? "";
    const from = (before?.[field.key] ?? "").trim();
    if (before === null) {
      if (to) changes.push({ label: field.label, from: "", to });
    } else if (from !== to) {
      changes.push({ label: field.label, from, to });
    }
  }

  return changes;
}
