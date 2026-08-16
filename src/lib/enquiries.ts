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
 * Bulk buy — FN-03
 * ------------------------------------------------------------------ */

export type BulkBuyInput = {
  company: string;
  contactName: string;
  email: string;
  phone: string;
  message: string;
};

export async function createBulkBuyEnquiry(
  input: BulkBuyInput
): Promise<Result> {
  const email = trim(input.email);
  const contactName = trim(input.contactName);
  const message = trim(input.message);

  if (!contactName) return fail("Please give us a contact name.");
  if (!email || !looksLikeEmail(email)) {
    return fail("Please give us an email address we can reply to.");
  }
  if (!message) return fail("Please tell us what you are looking for.");

  const user = await getSessionUser();

  await db.enquiry.create({
    data: {
      kind: "BulkBuy",
      company: trim(input.company),
      contactName,
      email,
      phone: trim(input.phone),
      message,
      userId: user?.id ?? null,
    },
  });

  return ok(undefined);
}

/* ------------------------------------------------------------------ *
 * Quote requests — FN-02
 * ------------------------------------------------------------------ */

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
  const contactName = trim(input.contactName);
  const email = trim(input.email);

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
        items: { create: lines.map((l) => ({ skuId: l.skuId, qty: l.qty })) },
      },
    });

    return ok({ reference });
  });
}
