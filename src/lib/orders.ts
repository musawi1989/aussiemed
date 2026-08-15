import "server-only";

import { db } from "./db";
import {
  DEFAULT_VAT_BASIS_POINTS,
  formatInvoiceNumber,
  formatReference,
  priceLine,
  sumLines,
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
  supplierId: string;
  supplierName: string;
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
  supplierCount: number;
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

export async function getCart(cartKey: string): Promise<CartView> {
  const [cart, bp] = await Promise.all([
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
                    supplier: true,
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
  ]);

  const lines: CartLineView[] = (cart?.items ?? []).map((item) => {
    const { sku } = item;
    const priced = priceLine(
      sku.priceFils,
      sku.tiers,
      item.qty,
      sku.product.taxClass,
      bp
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
      supplierId: sku.product.supplierId,
      supplierName: sku.product.supplier.companyName,
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
    supplierCount: new Set(lines.map((l) => l.supplierId)).size,
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

export async function addToCart(cartKey: string, skuCode: string, qty: number) {
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

  return getCart(cartKey);
}

export async function setCartQty(cartKey: string, itemId: string, qty: number) {
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

  return getCart(cartKey);
}

export async function removeFromCart(cartKey: string, itemId: string) {
  const cart = await db.cart.findUnique({ where: { cartKey } });
  if (!cart) throw new CartError("No cart", "not_found", 404);
  await db.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
  return getCart(cartKey);
}

export async function clearCart(cartKey: string) {
  const cart = await db.cart.findUnique({ where: { cartKey } });
  if (cart) await db.cartItem.deleteMany({ where: { cartId: cart.id } });
  return getCart(cartKey);
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
  poReference?: string | null;
  /** INVENTED DEFAULT: v1 ships offline / purchase order only — see IN-04. */
  paymentMethod?: string;
  /** "Delivery" or "PickUp". Anything else is treated as a delivery. */
  deliveryType?: string | null;
  /** What the buyer typed at checkout — a ward name, a delivery instruction. */
  notes?: string | null;
};

export type CheckoutResult = {
  reference: string;
  invoiceCount: number;
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
  const cart = await getCart(input.cartKey);

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

  return db.$transaction(async (tx) => {
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

    /* --- group by supplier --- */

    const bySupplier = new Map<string, typeof cart.lines>();
    for (const line of cart.lines) {
      const list = bySupplier.get(line.supplierId) ?? [];
      list.push(line);
      bySupplier.set(line.supplierId, list);
    }

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

    const TERM_DAYS: Record<string, number> = {
      Prepaid: 0,
      Net7: 7,
      Net30: 30,
      Net60: 60,
    };
    const days = TERM_DAYS[organisation?.paymentTerms ?? "Prepaid"] ?? 0;
    const paymentDueOn = new Date(Date.now() + days * 86_400_000);

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
        }),
      },
    });

    /* --- one invoice per supplier --- */

    let index = 0;
    for (const [supplierId, lines] of [...bySupplier.entries()].sort()) {
      index += 1;
      const totals = sumLines(
        lines.map((l) => ({
          lineTotalFils: l.lineTotalFils,
          vatFils: l.vatFils,
        })) as PricedLine[]
      );

      const invoice = await tx.orderSupplierInvoice.create({
        data: {
          orderId: order.id,
          supplierId,
          invoiceNumber: formatInvoiceNumber(reference, index),
          status: "Pending",
          subtotalFils: totals.subtotalFils,
          vatFils: totals.vatFils,
          totalFils: totals.totalFils,
        },
      });

      for (const line of lines) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            invoiceId: invoice.id,
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
    }

    /* --- empty the cart --- */

    const cartRow = await tx.cart.findUnique({ where: { cartKey: input.cartKey } });
    if (cartRow) await tx.cartItem.deleteMany({ where: { cartId: cartRow.id } });

    return {
      reference,
      invoiceCount: index,
      totalFils: orderTotals.totalFils,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Reading an order back
 * ------------------------------------------------------------------ */

export async function getOrderByReference(reference: string) {
  return db.order.findUnique({
    where: { reference },
    include: {
      invoices: {
        orderBy: { invoiceNumber: "asc" },
        include: {
          supplier: true,
          items: { include: { sku: { include: { product: true } } } },
        },
      },
    },
  });
}
