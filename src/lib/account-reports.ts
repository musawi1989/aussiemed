import "server-only";

import { db } from "./db";
import { accountSession } from "./account";

/**
 * One order, as the customer's own invoice.
 *
 * This file held the Spending report as well until 24 Aug 2026, when the
 * client removed it — see DEC-38. What is left is the lookup behind
 * /account/invoices/[reference], which is reached from Orders.
 *
 * Scoped by the session: the function takes no organisation id, so one
 * clinic cannot read another's invoice by changing a value in a URL.
 */

/**
 * One order, for the customer's own invoice.
 *
 * Scoped by session, so a reference belonging to another account simply does
 * not resolve. Nothing about a supplier or a cost is selected — a customer's
 * invoice has never carried either, and the way to keep it that way is not to
 * read them.
 */
export async function invoiceForAccount(reference: string) {
  const session = await accountSession();
  if (!session) return null;

  return db.order.findFirst({
    where: { reference, organisationId: session.organisationId },
    select: {
      reference: true,
      placedAt: true,
      status: true,
      paymentStatus: true,
      paymentDueOn: true,
      // What has actually come in, so the invoice can show a balance rather
      // than only a total. On credit terms a part payment is normal, and a
      // document that shows the full total next to the word "Part paid"
      // leaves the reader to do the subtraction we already know the answer to.
      paidFils: true,
      poReference: true,
      deliveryType: true,
      courier: true,
      trackingNumber: true,
      subtotalFils: true,
      vatFils: true,
      totalFils: true,
      vatRateBasisPoints: true,
      shippingSnapshot: true,
      placedByName: true,
      staff: { select: { name: true } },
      address: { select: { label: true, city: true } },
      organisation: { select: { name: true, trn: true } },
      items: {
        orderBy: { nameSnapshot: "asc" },
        select: {
          nameSnapshot: true,
          skuCodeSnapshot: true,
          unitLabelSnapshot: true,
          taxClassSnapshot: true,
          qty: true,
          unitPriceFils: true,
          vatFils: true,
          lineTotalFils: true,
        },
      },
    },
  });
}

export type AccountInvoice = NonNullable<Awaited<ReturnType<typeof invoiceForAccount>>>;

