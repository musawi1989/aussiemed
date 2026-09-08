/**
 * Opening a trade account: what is required, and what each answer means.
 *
 * A self-service sign-up here is an application, not an account. AussieMed
 * sells to businesses on credit terms, and the person filling this in is
 * somebody nobody has met — so the form gathers what is needed to decide, and
 * the decision is a person's.
 *
 * Three gates, and they are genuinely different questions:
 *
 *  1. Is the form filled in — checked here.
 *  2. Is the email real — proved by a one-time code, so a typo in an address
 *     is caught before it becomes the only way to reach a customer about an
 *     order they have paid for.
 *  3. Should we trade with them — a person's decision, made afterwards.
 *
 * A verified email is not an approved account and the two must not be confused:
 * proving an address only says we can reach somebody.
 *
 * Pure. No imports at runtime.
 */

/* ------------------------------------------------------------------ *
 * The one-time code
 * ------------------------------------------------------------------ */

/** Six digits: long enough not to be guessed, short enough to be read aloud. */
export const OTP_LENGTH = 6;

/**
 * Long enough to find the email, short enough that a code left in an inbox is
 * not a key to the account a week later.
 */
export const OTP_MINUTES = 15;

/**
 * Attempts before the code is dead.
 *
 * Six digits is a million combinations, which is plenty against a person and
 * nothing against a script. Without a cap, an unlimited retry loop turns the
 * code into a formality.
 */
export const OTP_MAX_ATTEMPTS = 5;

export function otpExpiry(now: Date): Date {
  return new Date(now.getTime() + OTP_MINUTES * 60_000);
}

/**
 * Codes are compared as typed-and-tidied rather than exactly.
 *
 * People paste "123 456" out of an email, and refusing that is refusing the
 * right code for the space in it.
 */
export function normaliseOtp(input: string | null | undefined): string {
  return (input ?? "").replace(/\D/g, "");
}

export type OtpCheck =
  | { ok: true }
  | { ok: false; reason: "expired" | "wrong" | "missing" };

export function checkOtp(input: {
  typed: string | null | undefined;
  expected: string | null | undefined;
  expiresAt: Date | null | undefined;
  now: Date;
}): OtpCheck {
  const typed = normaliseOtp(input.typed);
  const expected = normaliseOtp(input.expected);

  if (!expected || !input.expiresAt) return { ok: false, reason: "missing" };
  // Expiry is checked before correctness so an expired code cannot be
  // distinguished from a wrong one by how long the answer takes.
  if (input.expiresAt.getTime() <= input.now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (typed.length !== OTP_LENGTH || typed !== expected) {
    return { ok: false, reason: "wrong" };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * The application form
 * ------------------------------------------------------------------ */

export type ApplicationInput = {
  companyName: string;
  trn: string;
  contactName: string;
  email: string;
  phone: string;
  password: string;
  /** Google applicants have no password: the provider vouches for the email. */
  viaGoogle?: boolean;
};

export type FieldError = { field: string; message: string };

/** Deliberately not a strict address grammar — deliverability is IN-03. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Short enough not to be a barrier, long enough to matter. Length beats
 * character classes: a rule demanding a symbol produces "Password1!" on every
 * account, which is not a secret. SEC-03 records that a policy is unagreed.
 */
export const MIN_PASSWORD = 10;

export function validateApplication(input: ApplicationInput): FieldError[] {
  const errors: FieldError[] = [];
  const need = (field: string, value: string, message: string) => {
    if (!value.trim()) errors.push({ field, message });
  };

  need("companyName", input.companyName, "Tell us the name of your practice or company.");
  need("contactName", input.contactName, "Tell us who you are.");

  const email = input.email.trim().toLowerCase();
  if (!email) {
    errors.push({ field: "email", message: "We need an email address." });
  } else if (!LOOKS_LIKE_EMAIL.test(email)) {
    errors.push({ field: "email", message: "That does not look like an email address." });
  }

  // A TRN is required at application, per the client. It is what makes a
  // compliant tax invoice possible, and asking for it a month later means
  // reissuing every document sent in between.
  const trn = input.trn.replace(/\D/g, "");
  if (!trn) {
    errors.push({
      field: "trn",
      message: "We need your Tax Registration Number to invoice you correctly.",
    });
  } else if (trn.length !== 15) {
    errors.push({
      field: "trn",
      message: "A UAE TRN is 15 digits. Check it against your VAT certificate.",
    });
  }

  if (!input.viaGoogle) {
    if (input.password.length < MIN_PASSWORD) {
      errors.push({
        field: "password",
        message: `Use at least ${MIN_PASSWORD} characters. Length matters more than symbols.`,
      });
    }
  }

  if (!input.phone.trim()) {
    errors.push({ field: "phone", message: "We need a number to reach you on." });
  }

  return errors;
}

/* ------------------------------------------------------------------ *
 * What an applicant is allowed to do
 * ------------------------------------------------------------------ */

export type AccountState = {
  isVerified: boolean;
  approvalStatus: string;
  isDisabled: boolean;
  rejectedReason?: string | null;
};

export type SignInVerdict =
  | { allowed: true }
  | { allowed: false; reason: string; canResendOtp?: boolean };

/**
 * Why somebody cannot sign in, said plainly.
 *
 * Ordinary sign-in failures stay deliberately vague — a wrong password must
 * not reveal whether an address is registered. These are different: the person
 * has proved who they are and is being held up by us. "Those details do not
 * match an account" to somebody whose application is sitting in a queue is a
 * lie that generates a support call.
 */
export function canSignIn(account: AccountState): SignInVerdict {
  if (account.isDisabled) {
    return { allowed: false, reason: "This account has been closed. Email info@aussiemed.com if that is wrong." };
  }

  /*
   * AN ADMIN APPROVAL LETS SOMEBODY IN WHETHER OR NOT THEY ENTERED THE CODE.
   *
   * The code proves an address reaches somebody, which is worth having when a
   * stranger fills in a form. It is worth nothing when an account manager has
   * met the company, taken the order on the phone and opened the account by
   * hand — and holding that buyer at the door until they find an email they
   * were never waiting for is the platform being pedantic at a paying
   * customer's expense.
   *
   * isVerified is NOT set by approving, deliberately. It goes on meaning "the
   * code was entered" rather than becoming a second word for approved, so the
   * admin screens can still say whether an address has actually been proved —
   * which matters, because an approved typo is an account whose owner never
   * receives an invoice.
   *
   * The order of these branches carries that: approval is checked first, so a
   * rejected or waiting applicant still gets told about the code, and only
   * somebody we have positively said yes to skips it.
   */
  if (account.approvalStatus === "Approved") {
    return { allowed: true };
  }

  if (!account.isVerified) {
    return {
      allowed: false,
      reason: "Your email address has not been confirmed yet. Enter the code we sent you.",
      canResendOtp: true,
    };
  }
  if (account.approvalStatus === "Pending") {
    return {
      allowed: false,
      reason:
        "Your application is with our team. We will email you as soon as it is approved — usually within one working day.",
    };
  }
  if (account.approvalStatus === "Rejected") {
    return {
      allowed: false,
      reason:
        account.rejectedReason?.trim() ||
        "We were not able to open a trade account on this application. Email info@aussiemed.com to discuss it.",
    };
  }
  return { allowed: true };
}

/**
 * Applications an admin has to look at.
 *
 * VERIFIED OR NOT. This used to require the code, on the reasoning that an
 * unconfirmed application might be a typo and was not worth a person's time.
 * That was true of the count and wrong about the queue: it meant a company an
 * account manager had already spoken to sat in a greyed list marked "nothing to
 * do", and the only way to open their account was to wait for an email they
 * were not expecting.
 *
 * Whether the address has been proved is still shown on the card — see
 * needsAddressWarning — because it changes what approving means, not whether
 * it can be done.
 */
export function isAwaitingDecision(account: AccountState): boolean {
  return !account.isDisabled && account.approvalStatus === "Pending";
}

/**
 * Whether approving this application would open an account we cannot email.
 *
 * Worth saying at the moment of deciding rather than in a report afterwards: an
 * approved typo is an account whose owner never receives an order confirmation
 * or an invoice, and nobody finds out until they ring up asking where it is.
 */
export function needsAddressWarning(account: AccountState): boolean {
  return !account.isVerified && account.approvalStatus === "Pending";
}
