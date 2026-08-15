import { NextResponse } from "next/server";
import { getSessionUser, signIn, signOut } from "@/lib/auth";

/**
 * POST   /api/v1/auth   { identifier, password }   sign in
 * DELETE /api/v1/auth                              sign out
 * GET    /api/v1/auth                              who am I
 */

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const identifier = String(body?.identifier ?? "").trim();
  const password = String(body?.password ?? "");

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

  return NextResponse.json({ user: result.user });
}

export async function DELETE() {
  await signOut();
  return NextResponse.json({ ok: true });
}
