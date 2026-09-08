import "server-only";

import { DEFAULT_COUNTRY, countryName } from "./geo";

import { db } from "./db";
import { orderConfirmation } from "./email-message";
import { paymentDueOn as dueOn } from "./payment-options";
import { sendQuietly } from "./mailer";
import {
  DEFAULT_VAT_BASIS_POINTS,
  formatInvoiceNumber,
  formatReference,
  priceLine,
  sumLines,
  unitPriceFilsFor,
  type AccountTerms,
  type PricedLine,
} from "./pricing";
import { orderDiscount } from "./order-discounts";

/**
 * Cart and checkout against the database.
 *
 * Everything a customer buys is priced here, on the server, in fils. The
 * browser never decides a price and never allocates a reference number.
 */

/* ------------------------------------------------------------------ *
 * Cart
 * ------------------------------------------------------------------ */

export type CartLineView = {
  id: string;
  skuId: string;
  skuCode: string;
  productSlug: string;
  productName: string;
  brand: string | null;
  unitLabel: string;
  unitShortLabel: string;
  eachesPerPack: number;
  taxClass: string;
  qty: number;
  unitPriceFils: number;
  lineTotalFils: number;
  vatFils: number;
  basePriceFils: number;
  /**
   * What one unit would cost at this quantity WITHOUT this account's terms —
   * after any volume break, before the account discount or an agreed price.
   *
   * Always a number on a live cart, because the cart is priced here and now
   * and we know both figures. It is the order line that can hold a null, and
   * only for orders placed before the column existed. See order-discounts.ts.
   */
  listUnitPriceFils: number;
  /** "AgreedPrice" | "AccountDiscount", or null when the line is at list. */
  discountSource: string | null;
  outOfStock: boolean;
  image: string | null;
};

export type CartView = {
  cartKey: string;
  lines: CartLineView[];
  subtotalFils: number;
  vatFils: number;
  totalFils: number;
  zeroRatedFils: number;
  itemCount: number;
  /**
   * What this cart would have come to at list, and what the account's terms
   * take off it. Zero and equal for a guest, and for an account on list
   * prices — so the summary simply has nothing to show rather than a row
   * reading "Discount AED 0.00".
   */
  listSubtotalFils: number;
  discountFils: number;
  /**
   * The rate the ACCOUNT is on, in basis points — not one worked back from
   * the totals.
   *
   * Those are different numbers and the difference is not academic. 2.5% of
   * AED 15.90 is 39.75 fils, which rounds to 40; divide 40 back by 1590 and
   * the answer is 2.52%. Across a mixed order carrying agreed prices as well,
   * a derived figure came out at 11.52% and was labelled "Account discount",
   * which is a specific false statement to a customer holding a contract.
   */
  accountDiscountBasisPoints: number;
};

async function vatBasisPoints(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: "vatRateBasisPoints" } });
  const parsed = row ? Number(row.value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_VAT_BASIS_POINTS;
}

/** Creates the cart on first use, so callers never handle a missing one. */
export async function getOrCreateCart(cartKey: string) {
  return db.cart.upsert({
    where: { cartKey },
    update: {},
    create: { cartKey },
  });
}

/**
 * What one account has agreed, ready to price a cart with.
 *
 * Fetched in one query per cart rather than one per line: an account with a
 * hundred agreed prices and a cart of three is still one round trip, and the
 * lookup is a Map because a cart of forty lines should not be forty scans.
 *
 * ⚠ THE ORGANISATION ID MUST COME FROM THE SESSION, never from a request
 * body. It is the only thing standing between a customer and another
 * account's negotiated prices. Both callers — the cart API and checkout —
 * take it from getSessionUser, and this function is where that stops being
 * true if anybody changes it.
 */
async function accountPricing(organisationId: string | null | undefined) {
  if (!organisationId) return { discountBasisPoints: 0, agreed: new Map<string, number>() };

  const [organisation, prices] = await Promise.all([
    db.organisation.findUnique({
      where: { id: organisationId },
      select: { discountBasisPoints: true },
    }),
    db.customerPrice.findMany({
      where: { organisationId },
      select: { skuId: true, priceFils: true },
    }),
  ]);

  return {
    discountBasisPoints: organisation?.discountBasisPoints ?? 0,
    agreed: new Map(prices.map((p) => [p.skuId, p.priceFils])),
  };
}

/**
 * The cart, priced for whoever is holding it.
 *
 * organisationId is optional and defaults to nobody, which prices at list —
 * the right answer for a guest and for anyone browsing signed out. A signed-in
 * buyer's account terms come from the session at the caller.
 */
export async function getCart(
  cartKey: string,
  organisationId?: string | null
): Promise<CartView> {
  const [cart, bp, account] = await Promise.all([
    db.cart.findUnique({
      where: { cartKey },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            sku: {
              include: {
                tiers: true,
                product: {
                  include: {
                    brand: true,
                    images: { orderBy: { sortOrder: "asc" }, take: 1 },
                  },
                },
              },
            },
          },
        },
      },
    }),
    vatBasisPoints(),
    accountPricing(organisationId),
  ]);

  const lines: CartLineView[] = (cart?.items ?? []).map((item) => {
    const { sku } = item;
    // has() rather than a truthiness check on the value: a SKU agreed at zero
    // is a real arrangement, and reading it as "no agreement" would charge a
    // customer list price for something we said was free.
    const terms: AccountTerms = {
      discountBasisPoints: account.discountBasisPoints,
      agreedPriceFils: account.agreed.has(sku.id) ? account.agreed.get(sku.id) : null,
    };
    const priced = priceLine(
      sku.priceFils,
      sku.tiers,
      item.qty,
      sku.product.taxClass,
      bp,
      terms
    );
    /*
     * The same line priced with no account terms at all — what anybody
     * walking in off the street would pay at this quantity, volume break
     * included.
     *
     * Deliberately NOT sku.priceFils. Measuring a saving against the
     * single-unit price would count the volume break as though we had granted
     * it to this account, and a buyer ordering twelve would be shown a
     * discount that everybody gets.
     */
    const listUnitPriceFils = unitPriceFilsFor(sku.priceFils, sku.tiers, item.qty);
    const agreed = terms.agreedPriceFils;
    const discountSource =
      agreed !== null && agreed !== undefined
        ? "AgreedPrice"
        : priced.unitPriceFils < listUnitPriceFils
          ? "AccountDiscount"
          : null;
    return {
      id: item.id,
      skuId: sku.id,
      skuCode: sku.skuCode,
      productSlug: sku.product.slug,
      productName: sku.product.name,
      brand: sku.product.brand?.name ?? null,
      unitLabel: sku.unitLabel,
      unitShortLabel: sku.unitShortLabel,
      eachesPerPack: sku.eachesPerPack,
      taxClass: sku.product.taxClass,
      basePriceFils: sku.priceFils,
      listUnitPriceFils,
      discountSource,
      outOfStock: sku.manualOutOfStock,
      image: sku.product.images[0]?.path ?? null,
      ...priced,
    };
  });

  const totals = sumLines(lines);
  // One place decides what a saving is, and it is tested. See
  // order-discounts.ts — the same function reads the order back afterwards,
  // so the figure at checkout and the figure on the invoice cannot drift.
  const saved = orderDiscount(lines);

  return {
    cartKey,
    lines,
    subtotalFils: totals.subtotalFils,
    vatFils: totals.vatFils,
    totalFils: totals.totalFils,
    listSubtotalFils: saved.listSubtotalFils ?? totals.subtotalFils,
    discountFils: saved.savingFils,
    accountDiscountBasisPoints: account.discountBasisPoints,
    zeroRatedFils: lines
      .filter((l) => l.vatFils === 0)
      .reduce((n, l) => n + l.lineTotalFils, 0),
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
  };
}

export class CartError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "out_of_stock" | "bad_request",
    readonly status = 400
  ) {
    super(message);
  }
}

/*
 * The four mutations all end by returning the cart, so each takes the account
 * too. Threading it through looks repetitive; the alternative is a cart that
 * prices correctly on load and at list the moment somebody changes a
 * quantity, which is the kind of bug that gets reported as "the price keeps
 * changing".
 */
export async function addToCart(
  cartKey: string,
  skuCode: string,
  qty: number,
  organisationId?: string | null
) {
  const amount = Math.max(1, Math.trunc(qty || 1));

  const sku = await db.productSku.findUnique({
    where: { skuCode },
    include: { product: true },
  });
  if (!sku) throw new CartError(`No SKU "${skuCode}"`, "not_found", 404);

  /*
   * OUT OF STOCK IS ALLOWED INTO THE CART.
   *
   * It was refused here, which told the buyer what we hold as plainly as a
   * badge would have: they pressed Add to cart and were turned away. The
   * decision is that a line we cannot fill is worth more as an order somebody
   * can ring about than as a sale lost to a competitor, so it goes through and
   * the admin order marks the lines that need a call.
   *
   * A product that is not Active is still refused below. That is a listing
   * which should not be on sale at all — a different thing from one we happen
   * to be out of today.
   */
  if (sku.product.status !== "Active") {
    throw new CartError(`${sku.product.name} is not available`, "bad_request", 409);
  }

  const cart = await getOrCreateCart(cartKey);

  // One line per SKU: a box and a carton are different SKUs and stay separate,
  // while the same SKU added twice accumulates.
  await db.cartItem.upsert({
    where: { cartId_skuId: { cartId: cart.id, skuId: sku.id } },
    update: { qty: { increment: amount } },
    create: { cartId: cart.id, skuId: sku.id, qty: amount },
  });

  return getCart(cartKey, organisationId);
}

export async function setCartQty(
  cartKey: string,
  itemId: string,
  qty: number,
  organisationId?: string | null
) {
  const amount = Math.max(0, Math.trunc(qty));
  const cart = await db.cart.findUnique({ where: { cartKey } });
  if (!cart) throw new CartError("No cart", "not_found", 404);

  const item = await db.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
  });
  if (!item) throw new CartError("No such cart line", "not_found", 404);

  // Zero removes the line — the quantity control's minus button reaching zero
  // should not leave an empty row behind.
  if (amount === 0) await db.cartItem.delete({ where: { id: item.id } });
  else await db.cartItem.update({ where: { id: item.id }, data: { qty: amount } });

  return getCart(cartKey, organisationId);
}

export async function removeFromCart(
  cartKey: string,
  itemId: string,
  organisationId?: string | null
) {
  const cart = await db.cart.findUnique({ where: { cartKey } });
  if (!cart) throw new CartError("No cart", "not_found", 404);
  await db.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
  return getCart(cartKey, organisationId);
}

export async function clearCart(cartKey: string, organisationId?: string | null) {
  const cart = await db.cart.findUnique({ where: { cartKey } });
  if (cart) await db.cartItem.deleteMany({ where: { cartId: cart.id } });
  return getCart(cartKey, organisationId);
}

/* ------------------------------------------------------------------ *
 * Checkout
 * ------------------------------------------------------------------ */

export type CheckoutInput = {
  cartKey: string;
  /** Set when the buyer is signed in, so the order joins their history. */
  userId?: string | null;
  organisationId?: string | null;
  company: string;
  contact: string;
  email: string;
  phone: string;
  line1: string;
  emirate: string;
  /** ISO 3166-1 alpha-2. Defaults to the UAE when a caller omits it. */
  countryCode?: string | null;
  poReference?: string | null;
  /** INVENTED DEFAULT: v1 ships offline / purchase order only — see IN-04. */
  paymentMethod?: string;
  /** "Delivery" or "PickUp". Anything else is treated as a delivery. */
  deliveryType?: string | null;
  /** What the buyer typed at checkout — a ward name, a delivery instruction. */
  notes?: string | null;
  /** Which of the account's branches this is for. */
  addressId?: string | null;
  /** Who at the customer is placing it — a name on their own list, not a login. */
  staffId?: string | null;
};

export type CheckoutResult = {
  reference: string;
  totalFils: number;
};

/**
 * Places an order.
 *
 * One transaction. Either the order, all of its per-supplier invoices and all
 * of its lines exist, or none of them do — a half-written order with a
 * reference number the customer has been shown is the worst possible outcome.
 */
export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  /*
   * Priced through getCart with the account, so the figures written to the
   * order are the figures the buyer was shown. Pricing again here — or
   * forgetting the organisation here — is exactly how a checkout charges list
   * for a cart that displayed an agreed price, and nobody notices until an
   * invoice is queried.
   */
  const cart = await getCart(input.cartKey, input.organisationId);

  if (cart.lines.length === 0) {
    throw new CartError("Cart is empty", "bad_request", 409);
  }
  /*
   * No stock check. A cart that filled up while a line ran out still checks
   * out, for the same reason it was allowed in: refusing at this point names
   * the line to the buyer, and does it at the worst possible moment — with
   * their details typed and the order in front of them.
   *
   * What we cannot fill is dealt with afterwards, by somebody who can offer an
   * alternative. See the note in addToCart.
   */

  const bp = await vatBasisPoints();
  const year = new Date().getUTCFullYear();

  const placed = await db.$transaction(async (tx) => {
    /* --- allocate the reference number --- */

    // Held in a settings row and incremented inside the transaction, so two
    // simultaneous checkouts cannot be handed the same number.
    const key = `orderSequence:${year}`;
    const current = await tx.setting.findUnique({ where: { key } });
    const sequence = (current ? Number(current.value) : 0) + 1;
    await tx.setting.upsert({
      where: { key },
      update: { value: String(sequence) },
      create: { key, value: String(sequence) },
    });

    const reference = formatReference(year, sequence);

    /* An order is no longer split between suppliers.
     *
     * AussieMed is the seller of record (DEC-22), so the customer gets one
     * order and one invoice from AussieMed. Which supplier each line will be
     * bought from is not decided here at all — under cross-dock nothing is
     * bought until the cutoff, and the primary or backup is chosen then, from
     * whoever can actually supply on the day (DEC-25, DEC-26). Deciding it at
     * checkout would have been deciding it with the wrong information. */

    const priced = cart.lines.map((l) => ({
      lineTotalFils: l.lineTotalFils,
      vatFils: l.vatFils,
    })) as PricedLine[];
    const orderTotals = sumLines(priced);

    /**
     * The payment due date is worked out here, from the account's terms, and
     * then stored on the order. Deriving it on the fly would mean a customer
     * moved from Net 30 to Net 7 silently gaining an overdue invoice on
     * everything they had already bought.
     */
    const organisation = input.organisationId
      ? await tx.organisation.findUnique({
          where: { id: input.organisationId },
          // The discount as well as the terms: what the account was given is
          // snapshotted onto the order beside the VAT rate, so moving them to
          // a different rate tomorrow cannot restate an invoice already sent.
          select: { paymentTerms: true, discountBasisPoints: true },
        })
      : null;

    /*
     * Terms come from payment-options.ts rather than a table of its own, so
     * the date the buyer was shown at checkout and the date stored on the
     * order are computed by the same function. They used to be two copies of
     * the same numbers, and Net14 would have been added to only one of them.
     *
     * A guest is Prepaid: no account means no credit. An account uses what it
     * was agreed, which for a new one is Net14.
     */
    const paymentDueOn = dueOn(
      organisation?.paymentTerms ?? "Prepaid",
      new Date()
    );

    /*
     * Who placed it, and where it goes.
     *
     * Both are checked against this organisation rather than trusted from the
     * form, because either could be swapped for another account's id. The
     * staff name is snapshotted alongside the link for the same reason every
     * other name on an order is: removing someone from the list later must not
     * blank the orders they placed.
     */
    const staff = input.staffId
      ? await tx.organisationStaff.findFirst({
          where: {
            id: input.staffId,
            organisationId: input.organisationId ?? "",
          },
          select: { id: true, name: true },
        })
      : null;

    const branch = input.addressId
      ? await tx.address.findFirst({
          where: {
            id: input.addressId,
            organisationId: input.organisationId ?? "",
          },
          // The label as well as the id: the confirmation email names where
          // the order is going, and it is read outside this transaction.
          select: { id: true, label: true, city: true },
        })
      : null;

    /* --- the order --- */

    const order = await tx.order.create({
      data: {
        reference,
        userId: input.userId ?? null,
        organisationId: input.organisationId ?? null,
        // Lets a guest read their own order back without an account.
        guestCartKey: input.userId ? null : input.cartKey,
        status: "Pending",
        paymentMethod: input.paymentMethod ?? "OfflinePurchaseOrder",
        poReference: input.poReference || null,
        paymentDueOn,
        deliveryType: input.deliveryType === "PickUp" ? "PickUp" : "Delivery",
        customerNotes: input.notes || null,
        addressId: branch?.id ?? null,
        staffId: staff?.id ?? null,
        placedByName: staff?.name ?? null,
        subtotalFils: orderTotals.subtotalFils,
        vatFils: orderTotals.vatFils,
        totalFils: orderTotals.totalFils,
        // Stored so a later rate change cannot rewrite this order.
        vatRateBasisPoints: bp,
        // Likewise the account's discount. A guest has none.
        accountDiscountBasisPoints: organisation?.discountBasisPoints ?? 0,
        // The address as given at the time. Editing an address book entry
        // later must not alter where a historical order was sent.
        shippingSnapshot: JSON.stringify({
          company: input.company,
          contact: input.contact,
          email: input.email,
          phone: input.phone,
          line1: input.line1,
          emirate: input.emirate,
          // Snapshotted like everything else on this object: where an order
          // was sent must not move when an address book entry is edited.
          countryCode: input.countryCode ?? DEFAULT_COUNTRY,
          country: countryName(input.countryCode ?? DEFAULT_COUNTRY),
        }),
      },
    });

    /* --- the lines --- */

    for (const line of cart.lines) {
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          skuId: line.skuId,
          // Snapshots: a later price change or rename must never alter a
          // historical order line.
          nameSnapshot: line.productName,
          skuCodeSnapshot: line.skuCode,
          unitLabelSnapshot: line.unitLabel,
          taxClassSnapshot: line.taxClass,
          qty: line.qty,
          unitPriceFils: line.unitPriceFils,
          lineTotalFils: line.lineTotalFils,
          vatFils: line.vatFils,
          // What this would have cost at list, and why it did not. Snapshotted
          // like the name and the tax class: a saving printed on an invoice is
          // a claim made to a customer, and recomputing it from tomorrow's
          // prices would quietly restate a document already sent.
          listUnitPriceFils: line.listUnitPriceFils,
          discountSource: line.discountSource,
        },
      });
    }

    /* --- empty the cart --- */

    const cartRow = await tx.cart.findUnique({ where: { cartKey: input.cartKey } });
    if (cartRow) await tx.cartItem.deleteMany({ where: { cartId: cartRow.id } });

    return {
      reference,
      totalFils: orderTotals.totalFils,
      orderId: order.id,
      staffName: staff?.name ?? null,
      branchLabel: branch ? (branch.label ?? branch.city) : null,
      subtotalFils: orderTotals.subtotalFils,
      vatFils: orderTotals.vatFils,
    };
  });

  // Outside the transaction, and deliberately after it commits. An order that
  // is in the database is placed; if the confirmation cannot go out, that is a
  // mail problem to fix on /admin/emails, not a reason to lose the order.
  await sendQuietly(
    orderConfirmation({
      to: input.email,
      contactName: input.contact,
      reference: placed.reference,
      placedAt: new Date(),
      lines: cart.lines.map((line) => ({
        name: line.productName,
        skuCode: line.skuCode,
        unitLabel: line.unitLabel,
        qty: line.qty,
        lineTotalFils: line.lineTotalFils,
      })),
      subtotalFils: placed.subtotalFils,
      vatFils: placed.vatFils,
      totalFils: placed.totalFils,
      poReference: input.poReference || null,
      placedByName: placed.staffName,
      branchLabel: placed.branchLabel,
    }),
    {
      entity: "Order",
      entityId: placed.orderId,
      // One confirmation per order, whatever happens to be retried.
      dedupeKey: `OrderConfirmation:${placed.reference}`,
    }
  );


  return { reference: placed.reference, totalFils: placed.totalFils };
}

/* ------------------------------------------------------------------ *
 * Reading an order back
 * ------------------------------------------------------------------ */

export async function getOrderByReference(reference: string) {
  return db.order.findUnique({
    where: { reference },
    include: {
      shipments: { orderBy: { sequence: "asc" }, include: { lines: true } },
      items: {
        orderBy: { nameSnapshot: "asc" },
        include: {
          sku: {
            include: {
              product: {
                include: {
                  /* The photograph beside the line, so a buyer checking an
                     order back recognises what they bought without opening
                     five product pages. Ordered, and a SKU-specific image
                     wins over the product's own where one exists — the black
                     glove rather than the range shot.

                     Two is enough: the tile shows one, and the second exists
                     only so a SKU-specific image can beat a general one
                     without a second query. */
                  images: { orderBy: { sortOrder: "asc" } },
                  brand: { select: { name: true } },
                  categories: {
                    orderBy: { categoryId: "asc" },
                    take: 1,
                    select: { category: { select: { slug: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}
