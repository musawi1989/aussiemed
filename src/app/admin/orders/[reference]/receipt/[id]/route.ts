import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { mimeForExtension } from "@/lib/document-file";
import { readDeliveryReceipt } from "@/lib/delivery-receipts";

/**
 * GET /admin/orders/:reference/receipt/:id — a stored delivery receipt.
 *
 * THIS ROUTE IS THE ONLY WAY TO THE BYTES, the same arrangement the TRN
 * certificates use. The files sit outside public/ precisely so no URL reaches
 * them directly, and this hands them over only to an admin. A sheet with a
 * customer's signature on a guessable public path is a leak waiting for
 * somebody to notice the pattern.
 *
 * The reference in the path is for legibility in a browser history and in the
 * audit trail — the id is what identifies the receipt, and a receipt belongs
 * to exactly one order by construction, so there is nothing to cross-check.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string; id: string }> }
) {
  const { id } = await params;

  // 404 rather than 403, and the same 404 for "not an admin", "no such
  // receipt" and "the bytes are missing". A different answer per case tells
  // whoever is guessing which ids exist.
  const user = await getSessionUser();
  if (!user || user.role !== "Admin") return new NextResponse(null, { status: 404 });

  const receipt = await readDeliveryReceipt(id);
  if (!receipt) return new NextResponse(null, { status: 404 });

  const extension = receipt.name.split(".").pop()?.toLowerCase() ?? "";

  return new NextResponse(new Uint8Array(receipt.bytes), {
    headers: {
      // From the extension we recorded, never from anything the uploader sent.
      // The fallback is application/octet-stream, which no browser will run.
      "Content-Type": mimeForExtension(extension),
      // inline, so a photograph opens for a look — the usual reason for
      // pressing View. The filename was sanitised at upload, which is what
      // stops a newline in it forging a second header here.
      "Content-Disposition": `inline; filename="${receipt.name}"`,
      // Belt and braces on a file somebody else supplied.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; object-src 'none'",
      // Never cached, and never by a shared cache: this is private paperwork.
      "Cache-Control": "private, no-store",
    },
  });
}
