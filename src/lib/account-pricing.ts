import "server-only";

import { db } from "./db";
import { accountSession } from "./account";

/**
 * The prices this account has agreed, for the storefront to show.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE CART. The agreed price was applied when
 * the cart was priced and nowhere before it, so a buyer on a negotiated rate
 * browsed the whole catalogue seeing prices that were not theirs and found out
 * only at the basket. This is the same data, read early enough to put on a
 * product page and a listing tile.
 *
 * KEYED BY SKU CODE AND IN AED, because that is what the storefront
 * components hold: a Pack carries `sku` — the CODE, not the database id — and
 * `priceAED`. Keyed by id first, which typechecked perfectly and matched
 * nothing at all, so every price rendered as though there were no agreement.
 * Fils stay the source of truth; the conversion is a display one at the edge,
 * the same money.ts makes everywhere else.
 *
 * EMPTY FOR ANYONE NOT SIGNED IN TO AN ACCOUNT, which matters more than it
 * looks: these prices are one company's commercial terms, and a page rendered
 * for a guest must never carry them.
 */

export type AgreedPrices = Record<string, number>;

export async function currentAgreedPrices(): Promise<AgreedPrices> {
  const session = await accountSession();
  if (!session?.organisationId) return {};

  const rows = await db.customerPrice.findMany({
    where: { organisationId: session.organisationId },
    select: { priceFils: true, sku: { select: { skuCode: true } } },
  });

  const map: AgreedPrices = {};
  for (const row of rows) map[row.sku.skuCode] = row.priceFils / 100;
  return map;
}
