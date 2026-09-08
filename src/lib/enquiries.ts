import "server-only";

import { db } from "./db";
import { getSessionUser } from "./auth";

/**
 * Capturing what customers ask for — FN-02, FN-03, FN-04.
 *
 * Three forms on the storefront submitted and reached nobody: a quote request,
 * a bulk-buy enquiry, and Notify Me. The first two are the highest-intent
 * visitors on the site, and the third is a customer telling you exactly what to
 * restock. All of it was discarded on arrival.
 *
 * Stored rather than emailed. Email is BE-05 and unbuilt, and waiting for it
 * would mean carrying on losing the enquiries in the meantime — whereas a row
 * in a queue someone can read is useful immediately, and is what the mailer
 * will send from when it exists. This is the same reasoning as the rest of the
 * capture-early group: an enquiry not recorded when it arrived cannot be
 * recovered afterwards.
 */

export type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

const trim = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
};

/* ------------------------------------------------------------------ *
 * Who is asking
 * ------------------------------------------------------------------ */

/**
 * The contact details of the buyer who is signed in, taken from their account.
 *
 * WHY THE SESSION RATHER THAN THE FORM. A signed-in buyer should not be typing
 * their own name and email into a form on a site they are already identified
 * on — it is a small insult and a reliable source of typos, and a typo'd email
 * on an enquiry is one nobody can answer.
 *
 * ⚠ IT IS ALSO THE ONLY SAFE READING. Once the fields are not on screen, a
 * post that still carries them is either stale or forged, so the identity has
 * to come from the session or not at all. Trusting the body would let anybody
 * file an enquiry under somebody else's name, which is worse than the typing.
 *
 * Null for a guest, and for a supplier or an admin — the storefront enquiry
 * forms are for buyers, and putting a supplier's own details on a bulk-buy
 * enquiry would be filing it against the wrong kind of company entirely.
 */
export async function signedInBuyer(): Promise<{
  contactName: string;
  email: string;
  phone: string;
  company: string;
} | null> {
  const session = await getSessionUser();
  if (!session || session.role !== "Customer") return null;

  const user = await db.user.findUnique({
    where: { id: session.id },
    select: {
      name: true,
      email: true,
      phone: true,
      organisation: { select: { name: true } },
    },
  });
  if (!user) return null;

  return {
    contactName: user.name,
    email: user.email,
    phone: user.phone ?? "",
    // The account they buy for, which is what an enquiry is really from. Their
    // own name stands in only when they have no account behind them.
    company: user.organisation?.name ?? "",
  };
}

/** Deliberately forgiving. A rejected enquiry is a lost customer. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/* ------------------------------------------------------------------ *
 * Notify me — FN-04
 * ------------------------------------------------------------------ */

export async function subscribeToRestock(
  skuCode: string,
  email: string
): Promise<Result> {
  const address = trim(email);
  if (!address || !looksLikeEmail(address)) {
    return fail("That does not look like an email address.");
  }

  const sku = await db.productSku.findUnique({
    where: { skuCode },
    select: { id: true },
  });
  if (!sku) return fail("That product is no longer listed.");

  const user = await getSessionUser();

  // Asking twice is not an error, it is someone checking. The unique
  // constraint on (sku, email) makes the second one a no-op rather than a
  // duplicate, and the account is attached if they have since signed in.
  await db.notifySubscription.upsert({
    where: { skuId_email: { skuId: sku.id, email: address } },
    update: { userId: user?.id ?? undefined },
    create: { skuId: sku.id, email: address, userId: user?.id ?? null },
  });

  return ok(undefined);
}

/* ------------------------------------------------------------------ *
 * Bulk buy requests — FN-02, and what FN-03 became
 * ------------------------------------------------------------------ */

/*
 * THE FREE-TEXT BULK-BUY ENQUIRY IS GONE, and so is everything that read it.
 *
 * There were two paths doing this job: an Enquiry row holding prose somebody
 * had to interpret, and a QuoteRequest holding real pack codes at real
 * quantities. Two admin queues, two sets of wording, and a customer choosing
 * between them with no way to know that one could be priced and one could not.
 *
 * The mechanism below survived because it can be priced; the NAME "bulk buy
 * request" survived because that is what the client and the buyer both call
 * it. The table is still QuoteRequest — renaming a column across fifteen
 * files and a migration would change nothing anybody can see.
 *
 * The Enquiry model itself is left in the schema. It is generic (`kind`), it
 * holds no rows, and a contact or support form is the obvious next thing to
 * want; dropping the table would be a migration to undo later.
 */

export type QuoteLineInput = { skuCode: string; qty: number };

export type QuoteInput = {
  contactName: string;
  email: string;
  notes: string;
  lines: QuoteLineInput[];
};

function quoteReference(sequence: number): string {
  return `QR-${new Date().getUTCFullYear()}-${String(sequence).padStart(5, "0")}`;
}

export async function createQuoteRequest(
  input: QuoteInput
): Promise<Result<{ reference: string }>> {
  // Same rule as the bulk-buy enquiry: signed in, and the details come from
  // the account rather than from a form we no longer show them.
  const account = await signedInBuyer();

  const contactName = account?.contactName ?? trim(input.contactName);
  const email = account?.email ?? trim(input.email);

  if (!contactName) return fail("Please give us a contact name.");
  if (!email || !looksLikeEmail(email)) {
    return fail("Please give us an email address we can reply to.");
  }
  if (input.lines.length === 0) {
    return fail("There is nothing on the quote to price.");
  }

  const user = await getSessionUser();

  const skus = await db.productSku.findMany({
    where: { skuCode: { in: input.lines.map((l) => l.skuCode) } },
    select: { id: true, skuCode: true },
  });
  const idByCode = new Map(skus.map((s) => [s.skuCode, s.id]));

  const lines = input.lines
    .map((line) => ({ skuId: idByCode.get(line.skuCode), qty: Math.max(1, Math.trunc(line.qty)) }))
    .filter((line): line is { skuId: string; qty: number } => Boolean(line.skuId));

  if (lines.length === 0) {
    return fail("None of those products are still listed.");
  }

  return db.$transaction(async (tx) => {
    // Sequential per year, like order references, so a quote can be referred
    // to on the phone without reading out a random string.
    const key = `quoteSequence:${new Date().getUTCFullYear()}`;
    const current = await tx.setting.findUnique({ where: { key } });
    const sequence = (current ? Number(current.value) : 0) + 1;
    await tx.setting.upsert({
      where: { key },
      update: { value: String(sequence) },
      create: { key, value: String(sequence) },
    });

    const reference = quoteReference(sequence);

    await tx.quoteRequest.create({
      data: {
        reference,
        contactName,
        contactEmail: email,
        notes: trim(input.notes),
        userId: user?.id ?? null,
        /*
         * ⚠ THE ACCOUNT, NOT JUST THE PERSON. This is what the buyer's own
         * panel scopes by, and leaving it null made a request invisible to the
         * clinic that sent it — the send succeeded, the reference came back,
         * and nothing appeared under Bulk buy requests.
         *
         * It was null on every new request for exactly as long as this feature
         * existed: the migration backfilled the old rows from their author's
         * account, so the panel looked right until somebody sent a new one.
         * Caught by sending one and going to look.
         *
         * Taken from the session, never from the form — the same rule the cart
         * and checkout follow, because an organisation id from a request body
         * is another account's data for the asking.
         */
        organisationId: user?.organisationId ?? null,
        items: { create: lines.map((l) => ({ skuId: l.skuId, qty: l.qty })) },
      },
    });

    return ok({ reference });
  });
}
