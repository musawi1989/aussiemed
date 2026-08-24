import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { readCartKey } from "@/lib/cart-cookie";
import { getOrderByReference } from "@/lib/orders";

/**
 * GET /orders/:reference/document/pdf — the order confirmation as a real file.
 *
 * WHY A SERVER-RENDERED PDF AT ALL. The document route beside this one is HTML
 * and window.print(), which is the right shape for the admin documents: a
 * person printing a picking list wants the dialogue. A customer clicking
 * "Download PDF" does not — they want a file. A browser cannot be made to save
 * one silently from a page; print() always opens the dialogue, deliberately,
 * and no amount of JavaScript gets around that. So the only way to hand
 * somebody a file on one click is to make the file here.
 *
 * WHY CHROMIUM RATHER THAN A PDF LIBRARY. pdfkit or @react-pdf/renderer would
 * be lighter, and both would mean writing the document a second time in their
 * own primitives — a second layout to keep in step with the first, which is
 * the kind of divergence this codebase goes out of its way to avoid elsewhere.
 * Rendering the page that already exists means the file and the screen cannot
 * disagree, and the print stylesheet that was already written does the paper
 * layout.
 *
 * ⚠ THIS NEEDS A BROWSER ON THE SERVER — IN-11 on the register. It is fine
 * locally, where Playwright is already installed. It constrains hosting: a
 * plain serverless function has no Chromium and a 300MB dependency will not
 * fit in one. Settle it with IN-01 rather than discovering it at deploy.
 *
 * The HTML document route stays. It is what this renders, it is what a person
 * who wants to print rather than save should get, and it is the fallback if
 * this ever cannot run.
 */

/** Chromium cannot be bundled, and the render is far too slow for the edge. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;

  /*
   * The access check is done HERE, before a browser is launched, and not left
   * to the page being rendered.
   *
   * Two reasons. Launching Chromium for a request that was never allowed is a
   * denial-of-service waiting to happen — it is the most expensive thing this
   * application does. And the render below carries the caller's cookies, so if
   * this route did not check, the only thing standing between a stranger and
   * the document would be the page's own check running inside a browser we
   * paid to start.
   *
   * Same rule as the page, and the same 404 for forbidden as for missing, so
   * the sequential references still cannot be walked.
   */
  const order = await getOrderByReference(reference);
  if (!order) return new NextResponse(null, { status: 404 });

  const [user, cartKey] = await Promise.all([getSessionUser(), readCartKey()]);
  const isAdmin = user?.role === "Admin";
  const isOwner = Boolean(user && order.userId === user.id);
  const isGuestWithClaim =
    !order.userId && Boolean(cartKey) && order.guestCartKey === cartKey;

  if (!isAdmin && !isOwner && !isGuestWithClaim) {
    return new NextResponse(null, { status: 404 });
  }

  // Imported here rather than at the top so that merely loading this module —
  // which Next does when it builds the route table — does not pull Chromium's
  // wrapper into memory on every cold start.
  const { chromium } = await import("playwright");

  const origin = new URL(request.url).origin;
  const target = `${origin}/orders/${encodeURIComponent(reference)}/document`;

  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext();

    /*
     * The caller's cookies, forwarded so the page renders as them.
     *
     * Passed as a header rather than parsed into structured cookies: the page
     * is fetched from this same origin, the header is what the server reads,
     * and parsing cookie strings correctly is a job with edge cases and no
     * upside here. Access was settled above; this only lets the page render.
     */
    const cookie = request.headers.get("cookie");
    if (cookie) await context.setExtraHTTPHeaders({ cookie });

    const page = await context.newPage();
    await page.goto(target, { waitUntil: "networkidle", timeout: 30_000 });

    const pdf = await page.pdf({
      // The stylesheet already says A4 with margins sized for a window
      // envelope. Honouring @page means the file and the print dialogue agree
      // rather than being laid out by two different sets of numbers.
      preferCSSPageSize: true,
      // Status pills and the placeholder-TRN warning are meaning, not
      // decoration. A document that drops them to save ink is missing the part
      // that says it is not valid for filing.
      printBackground: true,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        // attachment, not inline: the whole point is that clicking saves.
        "Content-Disposition": `attachment; filename="AussieMed-${reference}.pdf"`,
        // Never cached: an order changes as it is picked and shipped, and a
        // stale copy of somebody's paperwork is worse than a slow one.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // Loud on the server, and honest to the caller — a broken PDF download
    // that silently returns nothing looks like the button does not work.
    console.error(`PDF render failed for ${reference}:`, error);
    return NextResponse.json(
      {
        error: "pdf_unavailable",
        message:
          "The PDF could not be generated. The order can still be printed from " +
          `${origin}/orders/${reference}/document`,
      },
      { status: 503 }
    );
  } finally {
    await browser?.close();
  }
}
