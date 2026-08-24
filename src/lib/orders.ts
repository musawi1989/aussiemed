import "server-only";

import { DEFAULT_COUNTRY, countryName } from "./geo";

import { db } from "./db";
import { orderConfirmation } from "./email-message";
import { paymentDueOn as dueOn } from "./payment-options";
import { sendQuietly } from "./mailer";
import { notify } from "./notifications";
import {
  DEFAULT_VAT_BASIS_POINTS,
  formatInvoiceNumber,
  formatReference,
  priceLine,
  sumLines,
  type AccountTerms,
  type PricedLine,
} from "./pricing";

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
      outOfStock: sku.manualOutOfStock,
      image: sku.product.images[0]?.path ?? null,
      ...priced,
    };
  });

  const totals = sumLines(lines);

  return {
    cartKey,
    lines,
    subtotalFils: totals.subtotalFils,
    vatFils: totals.vatFils,
    totalFils: totals.totalFils,
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

  // Out of stock never enters the cart. A quote request is the path for a line
  // that is unavailable today.
  if (sku.manualOutOfStock) {
    throw new CartError(`${sku.product.name} is out of stock`, "out_of_stock", 409);
  }
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
  const unavailable = cart.lines.filter((l) => l.outOfStock);
  if (unavailable.length > 0) {
    throw new CartError(
      `${unavailable.map((l) => l.productName).join(", ")} went out of stock`,
      "out_of_stock",
      409
    );
  }

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
          select: { paymentTerms: true },
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

  await notify({
    kind: "OrderPlaced",
    subject: `New order ${placed.reference}`,
    body: [
      `${input.company || input.contact} placed order ${placed.reference}.`,
      `${cart.lines.length} line${cart.lines.length === 1 ? "" : "s"}, ` +
        `AED ${(placed.totalFils / 100).toFixed(2)} including VAT.`,
      placed.branchLabel ? `Delivering to ${placed.branchLabel}.` : null,
      placed.staffName ? `Ordered by ${placed.staffName}.` : null,
    ]
      .filter((line) => line !== null)
      .join("\n"),
    href: `/admin/orders/${placed.reference}`,
    entity: "Order",
    entityId: placed.orderId,
  });

  return { reference: placed.reference, totalFils: placed.totalFils };
}

/* ------------------------------------------------------------------ *
 * Reading an order back
 * ------------------------------------------------------------------ */

export async function getOrderByReference(reference: string) {
  return db.order.findUnique({
    where: { reference },
    include: {
      items: {
        orderBy: { nameSnapshot: "asc" },
        include: { sku: { include: { product: true } } },
      },
    },
  });
}
