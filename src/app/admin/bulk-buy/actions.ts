"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, requireAdmin } from "@/lib/admin";
import { isSendableAddress, quoteReply } from "@/lib/email-message";
import { send } from "@/lib/mailer";
import { setBulkBuyStatus } from "@/lib/bulk-buy-admin";
import type { FormState } from "@/components/AdminForm";

/**
 * Answering a bulk buy request, and sending that answer to the person who
 * asked.
 *
 * IT REACHES THE CUSTOMER TWICE, and the second way is the newer one. The
 * email goes out as written, and the same words are shown to the buyer on
 * their own panel — so an answer given in August is still findable in
 * November, by them, without asking us for it again. A buyer who cannot find
 * the price they were quoted asks for it a second time, and the second answer
 * is rarely the same as the first.
 *
 * Typing it into a box that only files it, then retyping it into a mail
 * client, was two chances to disagree with ourselves about a number the
 * customer keeps.
 *
 * It is still not an automated email. A person writes every word and presses
 * the button, which is the line the platform draws — see the design principle
 * in CLAUDE.md. Nothing here decides a price, chases anybody, or fires on a
 * timer.
 *
 * SAVED BEFORE SENT, ALWAYS. The record is written first and the send happens
 * after, so a mailbox that bounces costs an email and never the words. The
 * outcome is reported back as it actually was — a message that could not be
 * delivered says so rather than showing a tick, because the whole reason
 * BE-05 records every attempt is that a silent failure looks exactly like a
 * success.
 */
/**
 * Where a change to a request has to become visible.
 *
 * The buyer's own panel as well as ours: the whole point of storing the answer
 * is that they can read it back, and a stale page there is the failure this
 * feature exists to fix.
 */
function refresh() {
  revalidatePath("/admin/bulk-buy");
  revalidatePath("/admin/approvals");
  revalidatePath("/account/bulk-buy");
}

export async function replyToQuoteAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const actor = await requireAdmin("bulkBuy");

  const id = String(data.get("quoteId") ?? "").trim();
  const reply = String(data.get("reply") ?? "").trim();
  const wantsEmail = data.get("sendEmail") !== null;

  // Echoed back so a refusal does not also delete what they had written. A
  // quote reply is several minutes of typing and losing it to a short-message
  // check would cost more than the mistake.
  const values = { reply };

  if (reply.length < 3) {
    return { ok: false, error: "Write the answer before sending it.", values };
  }

  const quote = await db.quoteRequest.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          sku: {
            select: {
              unitLabel: true,
              product: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!quote) {
    return { ok: false, error: "That request no longer exists.", values };
  }

  // Checked before the write, not after, so somebody about to email a typo of
  // an address is told while the box is still open rather than being
  // congratulated and left to find the suppressed row on /admin/emails.
  if (wantsEmail && !isSendableAddress(quote.contactEmail)) {
    return {
      ok: false,
      error:
        `We hold "${quote.contactEmail}" for ${quote.contactName}, which is ` +
        `not an address we can send to. Save without emailing and come back ` +
        `to them another way.`,
      values,
    };
  }

  const first = !quote.replyToCustomer;

  await db.quoteRequest.update({
    where: { id },
    data: {
      replyToCustomer: reply,
      answeredByName: actor.name,
      answeredAt: first ? new Date() : undefined,
      /*
       * ⚠ THE STATUS IS NOT TOUCHED. Answering is not finishing.
       *
       * It used to set "Quoted", which took the request out of the queue the
       * moment a price went back — and a price going back is the middle of the
       * conversation, not the end of it. Whether the buyer accepted, declined
       * or went quiet is a judgement about a conversation, made by the person
       * who had it, on the Completed button. See bulk-buy-requests.ts.
       */
    },
  });

  await audit(
    actor,
    first ? "bulkBuy.reply" : "bulkBuy.reply.edit",
    "QuoteRequest",
    quote.reference,
    { replyToCustomer: quote.replyToCustomer },
    { replyToCustomer: reply, emailed: wantsEmail }
  );

  refresh();

  if (!wantsEmail) {
    return {
      ok: true,
      message: first
        ? "Saved. No email was sent, and the request is still open."
        : "Updated. No email was sent.",
    };
  }

  const outcome = await send(
    quoteReply({
      to: quote.contactEmail,
      contactName: quote.contactName,
      reference: quote.reference,
      askedAt: quote.createdAt,
      theirNotes: quote.notes,
      reply,
      lines: quote.items.map((item) => ({
        qty: item.qty,
        name: item.sku.product.name,
        unitLabel: item.sku.unitLabel,
      })),
    }),
    // No dedupeKey. A revised quote is a real second email and the database
    // must not quietly swallow it; the checkbox on the form is the guard
    // against an accidental resend, and a person is the one ticking it.
    { entity: "QuoteRequest", entityId: quote.id }
  );

  if (outcome.status === "Sent") {
    return {
      ok: true,
      message: `Sent to ${quote.contactEmail}.`,
    };
  }

  // The reply is saved either way. Say plainly that the customer has not been
  // told, and where the failure is recorded.
  return {
    ok: false,
    error:
      `Your answer is saved, but the email did not go out ` +
      `(${outcome.status.toLowerCase()}${outcome.error ? `: ${outcome.error}` : ""}). ` +
      `It is on the Emails screen and can be retried from there.`,
    values,
  };
}

/**
 * Pending or Completed, both ways.
 *
 * Its own form rather than a control inside the reply box, because they are
 * different intents and one must not be able to trigger the other: marking a
 * request done should never send an email, and correcting a typo in a quote
 * should never close it.
 */
export async function setBulkBuyStatusAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const id = String(data.get("requestId") ?? "").trim();
  const status = String(data.get("status") ?? "").trim();

  const result = await setBulkBuyStatus(id, status);
  if (!result.ok) return { ok: false, error: result.error };

  refresh();
  return {
    ok: true,
    message:
      result.value.status === "Completed"
        ? "Marked completed."
        : "Back in the queue.",
  };
}
