import { NextResponse } from "next/server";
import { ensureCartKey } from "@/lib/cart-cookie";
import { CartError, checkout } from "@/lib/orders";
import { getSessionUser } from "@/lib/auth";

/**
 * POST /api/v1/checkout
 *
 * Places the order held in this visitor's cart. Returns the reference number
 * allocated by the server — the browser never invents one.
 */

const REQUIRED = [
  "company",
  "contact",
  "email",
  "phone",
  "line1",
  "emirate",
] as const;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const missing = REQUIRED.filter((field) => !String(body?.[field] ?? "").trim());
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "bad_request",
            message: `Missing required field(s): ${missing.join(", ")}`,
          },
        },
        { status: 400 }
      );
    }

    const cartKey = await ensureCartKey();
    // Guest checkout stays allowed; signing in simply attaches the order.
    const user = await getSessionUser();

    const result = await checkout({
      cartKey,
      userId: user?.id ?? null,
      organisationId: user?.organisationId ?? null,
      company: String(body.company).trim(),
      contact: String(body.contact).trim(),
      email: String(body.email).trim(),
      phone: String(body.phone).trim(),
      line1: String(body.line1).trim(),
      emirate: String(body.emirate).trim(),
      poReference: body.poReference ? String(body.poReference).trim() : null,
      notes: body.notes ? String(body.notes).trim() : null,
      // Both are verified against the buyer's own organisation inside
      // checkout(), never trusted from here.
      addressId: body.addressId ? String(body.addressId) : null,
      staffId: body.staffId ? String(body.staffId) : null,
    });

    return NextResponse.json({
      // "Reference number" is the customer-facing wording, never "order number".
      reference: result.reference,
      totalAED: result.totalFils / 100,
      currency: "AED",
    });
  } catch (error) {
    if (error instanceof CartError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    console.error("checkout error", error);
    return NextResponse.json(
      { error: { code: "server_error", message: "Could not place the order" } },
      { status: 500 }
    );
  }
}
