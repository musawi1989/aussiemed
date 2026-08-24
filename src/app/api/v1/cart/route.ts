import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ensureCartKey, readCartKey } from "@/lib/cart-cookie";
import {
  CartError,
  addToCart,
  clearCart,
  getCart,
  setCartQty,
  removeFromCart,
} from "@/lib/orders";

/**
 * The cart lives on the server.
 *
 *   GET     /api/v1/cart          read it
 *   POST    /api/v1/cart          { skuCode, qty }        add a line
 *   PATCH   /api/v1/cart          { itemId, qty }         set an absolute qty
 *   DELETE  /api/v1/cart          { itemId } | {}         remove a line, or all
 *
 * Prices are computed here, never accepted from the client — a browser must
 * not be able to tell the server what something costs.
 *
 * ⚠ THE ACCOUNT COMES FROM THE SESSION COOKIE, never from the request. It
 * decides which agreed prices and which account discount apply, so taking it
 * from a body would let anybody price a cart as anybody else. account() is
 * the only way it is obtained here.
 */

/** The signed-in buyer's account, or null for a guest — who pays list. */
async function account(): Promise<string | null> {
  const user = await getSessionUser();
  return user?.organisationId ?? null;
}

function fail(error: unknown) {
  if (error instanceof CartError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  console.error("cart error", error);
  return NextResponse.json(
    { error: { code: "server_error", message: "Something went wrong" } },
    { status: 500 }
  );
}

export async function GET() {
  const key = await readCartKey();
  // No cookie yet means an empty cart, not an error, and does not need a
  // cookie minted just for someone browsing.
  if (!key) {
    return NextResponse.json({
      cart: {
        cartKey: null,
        lines: [],
        subtotalFils: 0,
        vatFils: 0,
        totalFils: 0,
        zeroRatedFils: 0,
        itemCount: 0,
      },
    });
  }
  return NextResponse.json({ cart: await getCart(key, await account()) });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const skuCode = String(body?.skuCode ?? "");
    const qty = Number(body?.qty ?? 1);
    if (!skuCode) throw new CartError("skuCode is required", "bad_request");

    const key = await ensureCartKey();
    return NextResponse.json({
      cart: await addToCart(key, skuCode, qty, await account()),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const itemId = String(body?.itemId ?? "");
    const qty = Number(body?.qty);
    if (!itemId) throw new CartError("itemId is required", "bad_request");
    if (!Number.isFinite(qty)) throw new CartError("qty must be a number", "bad_request");

    const key = await ensureCartKey();
    return NextResponse.json({
      cart: await setCartQty(key, itemId, qty, await account()),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const itemId = body?.itemId ? String(body.itemId) : null;
    const key = await ensureCartKey();

    return NextResponse.json({
      cart: itemId
        ? await removeFromCart(key, itemId, await account())
        : await clearCart(key, await account()),
    });
  } catch (error) {
    return fail(error);
  }
}
