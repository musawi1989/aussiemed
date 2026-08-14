import "server-only";

import { cookies } from "next/headers";

/**
 * Guest carts are identified by a random key in a cookie, so a buyer can fill
 * a cart before signing in. On sign-in the guest cart merges into the user's —
 * that merge belongs with auth and is not built yet.
 *
 * INVENTED VALUES, logged in the register:
 *   cookie name  aussiemed_cart
 *   lifetime     30 days
 */
export const CART_COOKIE = "aussiemed_cart";
export const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** Reads the cart key, or null if this visitor has never had a cart. */
export async function readCartKey(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(CART_COOKIE)?.value ?? null;
}

/**
 * Reads the cart key, minting one if absent.
 *
 * Only safe in a route handler or server action — a server component cannot
 * set a cookie, which is why read and ensure are separate functions.
 */
export async function ensureCartKey(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(CART_COOKIE)?.value;
  if (existing) return existing;

  const key = crypto.randomUUID();
  jar.set(CART_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
    // Secure only in production: a local http dev server would drop it.
    secure: process.env.NODE_ENV === "production",
  });
  return key;
}
