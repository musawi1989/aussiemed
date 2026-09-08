"use server";

import {
  createQuoteRequest,
  subscribeToRestock,
  type QuoteLineInput,
} from "@/lib/enquiries";

/**
 * The storefront's "tell us what you want" forms — FN-02 and FN-04.
 *
 * Thin, like every other actions file: read the form, call the service, hand
 * back something the page can show. Both used to resolve to a message on screen
 * and nothing else.
 *
 * FN-03's free-text bulk-buy form is gone: /bulk-buy now teaches the quote
 * request instead of competing with it. Its action went with the form rather
 * than being left behind — an exported server action with nothing calling it is
 * still a reachable endpoint that writes rows, and one nobody is looking at.
 */

export type EnquiryState =
  | null
  | { ok: false; error: string }
  | { ok: true; reference?: string };

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export async function notifyMeAction(
  _state: EnquiryState,
  data: FormData
): Promise<EnquiryState> {
  const result = await subscribeToRestock(text(data, "skuCode"), text(data, "email"));
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function quoteRequestAction(
  _state: EnquiryState,
  data: FormData
): Promise<EnquiryState> {
  // The lines post as parallel arrays from the quote list, in document order.
  const codes = data.getAll("skuCode").map(String);
  const quantities = data.getAll("qty").map(String);

  const lines: QuoteLineInput[] = codes.map((skuCode, index) => ({
    skuCode,
    qty: Number(quantities[index] ?? 1),
  }));

  const result = await createQuoteRequest({
    contactName: text(data, "contact"),
    email: text(data, "email"),
    notes: text(data, "notes"),
    lines,
  });

  return result.ok
    ? { ok: true, reference: result.value.reference }
    : { ok: false, error: result.error };
}
