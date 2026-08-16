"use server";

import {
  createBulkBuyEnquiry,
  createQuoteRequest,
  subscribeToRestock,
  type QuoteLineInput,
} from "@/lib/enquiries";

/**
 * The storefront's three "tell us what you want" forms — FN-02, FN-03, FN-04.
 *
 * Thin, like every other actions file: read the form, call the service, hand
 * back something the page can show. All three used to resolve to a message on
 * screen and nothing else.
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

export async function bulkBuyAction(
  _state: EnquiryState,
  data: FormData
): Promise<EnquiryState> {
  const result = await createBulkBuyEnquiry({
    company: text(data, "company"),
    contactName: text(data, "contact"),
    email: text(data, "email"),
    phone: text(data, "phone"),
    message: text(data, "items"),
  });
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
