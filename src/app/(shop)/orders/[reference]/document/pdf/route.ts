import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/admin";
import { readCartKey } from "@/lib/cart-cookie";
import { getOrderByReference } from "@/lib/orders";
import { renderDocumentPdf } from "@/lib/render-document-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const order = await getOrderByReference(reference);
  if (!order) return new NextResponse(null, { status: 404 });
  const [user, cartKey] = await Promise.all([getSessionUser(), readCartKey()]);
  const admin = user?.role === "Admin";
  const owner = Boolean(user && order.userId === user.id);
  const guest = !order.userId && Boolean(cartKey) && order.guestCartKey === cartKey;
  if (!admin && !owner && !guest) return new NextResponse(null, { status: 404 });
  if (admin) await requireAdmin("orders", "view");
  const path = `/orders/${encodeURIComponent(reference)}/document`;
  try {
    const pdf = await renderDocumentPdf(path, (await cookies()).getAll());
    return new NextResponse(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="AussieMed-${reference.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf"`,
      "Cache-Control": "no-store",
    } });
  } catch (error) {
    console.error(`PDF render failed for ${reference}:`, error);
    return new NextResponse(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>PDF temporarily unavailable</title><body><h1>PDF temporarily unavailable</h1><p>Your order is saved. Open the printable document and choose Print or save as PDF.</p><a href="${path}">Open order document</a></body></html>`, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
}
