"use server";

import { revalidatePath } from "next/cache";
import { setOrderStatus } from "@/lib/admin";
import {
  pushAllOrdersToSuppliers,
  pushOrderToSuppliers,
  type PushResult,
} from "@/lib/purchasing";
import type { FormState } from "@/components/AdminForm";

function refreshBuying(reference?: string) {
  if (reference) revalidatePath(`/admin/orders/${reference}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/purchasing");
  revalidatePath("/admin");
}

/**
 * Turns the outcome of a push into one sentence somebody can act on.
 *
 * Every part of it is named rather than counted. "One could not be sent" is
 * the message that sends a person hunting through the purchase order list to
 * find out which; the reference and the reason cost a few more words and save
 * the hunt.
 */
function describe(result: PushResult): FormState {
  const { built, sent, unsent, unsourceable, addedToSent } = result;

  if (built.length === 0) {
    return {
      ok: true,
      message:
        unsourceable.length > 0
          ? `Nothing could be placed. ${unsourceable.length} line${unsourceable.length === 1 ? "" : "s"} ${unsourceable.length === 1 ? "has" : "have"} no supplier.`
          : "Nothing to place — every line is already on a purchase order.",
    };
  }

  const parts: string[] = [];

  if (sent.length > 0) {
    const suppliers = new Set(sent.map((po) => po.supplierName));
    parts.push(
      `${sent.length} purchase order${sent.length === 1 ? "" : "s"} sent to ` +
        (suppliers.size === 1
          ? [...suppliers][0]
          : `${suppliers.size} suppliers`)
    );
  }

  // The outcome that looks like success and is not: the lines are on a real
  // purchase order, and the supplier has not been told they were added.
  if (addedToSent.length > 0) {
    parts.push(
      `added to already-sent ${addedToSent
        .map((po) => `${po.poNumber} (${po.newLines} line${po.newLines === 1 ? "" : "s"}, ${po.supplierName} NOT notified)`)
        .join("; ")}`
    );
  }

  if (unsent.length > 0) {
    parts.push(
      `NOT sent: ${unsent.map((po) => `${po.poNumber} (${po.reason})`).join("; ")}`
    );
  }

  if (unsourceable.length > 0) {
    parts.push(
      `${unsourceable.length} line${unsourceable.length === 1 ? "" : "s"} could not be sourced`
    );
  }

  const message = `${parts.join(". ")}.`;

  // Anything a person still has to chase makes this a warning, not a tick.
  return unsent.length > 0 || addedToSent.length > 0
    ? { ok: false, error: message }
    : { ok: true, message };
}

/**
 * One customer order, placed with its suppliers now rather than at the cutoff.
 *
 * Pools and sources exactly as the daily run does — same monthly order per
 * supplier, same fallback, same allocations — but scoped to this order, so a
 * clinic that cannot wait does not drag the rest of the day forward with it.
 */
export async function pushOrderAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const reference = String(data.get("reference") ?? "").trim();

  const result = await pushOrderToSuppliers(reference);
  if (!result.ok) return { ok: false, error: result.error };

  refreshBuying(reference);
  return describe(result.value);
}

/** Every outstanding order, in one movement. */
export async function pushAllOrdersAction(
  _state: FormState,
  _data: FormData
): Promise<FormState> {
  const result = await pushAllOrdersToSuppliers();
  if (!result.ok) return { ok: false, error: result.error };

  refreshBuying();
  return describe(result.value);
}

export async function setOrderStatusAction(
  _state: FormState,
  data: FormData
): Promise<FormState> {
  const reference = String(data.get("reference") ?? "").trim();
  const status = String(data.get("status") ?? "").trim();

  const result = await setOrderStatus(reference, status);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/orders/${reference}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  return { ok: true, message: `Order moved to ${status}.` };
}
