import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { mimeForExtension } from "@/lib/document-file";
import { isTrnHolder, readTrnDocument } from "@/lib/trn-documents";

/**
 * GET /admin/trn-documents/:kind/:id — a stored TRN certificate.
 *
 * THIS ROUTE IS THE ONLY WAY TO THE BYTES. The files are kept outside public/
 * precisely so that no URL reaches them directly, and this hands them over
 * only to an admin. A tax certificate on a guessable public path is a leak
 * waiting for somebody to notice the pattern.
 *
 * The check is here AND in readTrnDocument. That looks redundant for one
 * caller and stops looking redundant the moment there are two.
 *
 * Under the /admin segment deliberately, so it sits inside whatever protects
 * that part of the site rather than beside the public API.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> }
) {
  const { kind, id } = await params;

  // 404 rather than 403 throughout, and the same 404 for "not an admin", "no
  // such record" and "no document on it". A different answer per case tells
  // whoever is guessing which ids exist.
  const user = await getSessionUser();
  if (!user || user.role !== "Admin") return new NextResponse(null, { status: 404 });
  if (!isTrnHolder(kind)) return new NextResponse(null, { status: 404 });

  const document = await readTrnDocument(kind, id);
  if (!document) return new NextResponse(null, { status: 404 });

  const extension = document.name.split(".").pop()?.toLowerCase() ?? "";

  return new NextResponse(new Uint8Array(document.bytes), {
    headers: {
      // From the extension we recorded, never from anything the uploader sent.
      // The fallback is application/octet-stream, which no browser will run.
      "Content-Type": mimeForExtension(extension),
      // inline, so a PDF opens for a look — the usual reason for pressing
      // View. The filename is sanitised at upload (safeDisplayName), which is
      // what keeps a newline in it from forging a second header here.
      "Content-Disposition": `inline; filename="${document.name}"`,
      // Belt and braces on a file somebody else supplied: no sniffing past
      // the type we set, and no scripts even if one is somehow rendered.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; object-src 'none'",
      // Never cached, and never by a shared cache: this is private paperwork.
      "Cache-Control": "private, no-store",
    },
  });
}
