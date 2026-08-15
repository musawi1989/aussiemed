import { NextResponse } from "next/server";
import { getSessionUser, signIn, signOut } from "@/lib/auth";

/**
 * POST   /api/v1/auth   { identifier, password, expectRole? }   sign in
 * DELETE /api/v1/auth                                           sign out
 * GET    /api/v1/auth                                           who am I
 */

/** Where each role is meant to sign in. */
const DOORS: Record<string, string> = {
  Customer: "the account sign-in",
  Supplier: "the business portal",
  Admin: "/admin",
};

/** Where each role lands once signed in. */
export const HOME_FOR: Record<string, string> = {
  Customer: "/account",
  Supplier: "/business-portal",
  Admin: "/admin",
};

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const identifier = String(body?.identifier ?? "").trim();
  const password = String(body?.password ?? "");
  const expectRole = body?.expectRole ? String(body.expectRole) : null;

  if (!identifier || !password) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Enter your details" } },
      { status: 400 }
    );
  }

  const result = await signIn(identifier, password);
  if (!result.ok) {
    // 401 with a generic message — the form must not reveal which accounts
    // exist.
    return NextResponse.json(
      { error: { code: "unauthorised", message: result.message } },
      { status: 401 }
    );
  }

  /**
   * Each role has its own door: buyers sign in at the account page, suppliers
   * at the business portal, admins at /admin. Arriving at the wrong one is a
   * routing mistake rather than a credentials problem, so name the right door
   * instead of letting a supplier land inside a buyer's account.
   *
   * The session created a moment ago is discarded, so a failed attempt here
   * leaves nobody signed in.
   */
  if (expectRole && result.user.role !== expectRole) {
    await signOut();
    const door = DOORS[result.user.role] ?? "the correct sign-in";
    const role = result.user.role.toLowerCase();
    const article = /^[aeiou]/.test(role) ? "an" : "a";
    return NextResponse.json(
      {
        error: {
          code: "wrong_door",
          message: `That is ${article} ${role} account. Please use ${door}.`,
          role: result.user.role,
          home: HOME_FOR[result.user.role] ?? "/",
        },
      },
      { status: 403 }
    );
  }

  return NextResponse.json({
    user: result.user,
    home: HOME_FOR[result.user.role] ?? "/",
  });
}

export async function DELETE() {
  await signOut();
  return NextResponse.json({ ok: true });
}
