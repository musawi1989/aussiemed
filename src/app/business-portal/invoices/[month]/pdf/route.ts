import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { myInvoice } from "@/lib/supplier-invoices";

/**
 * GET /business-portal/invoices/:month/pdf — the month's invoice as a file.
 *
 * The same shape as the order-confirmation PDF beside it, and for the same
 * reason: a browser cannot be made to save a file silently from a page —
 * print() always opens the dialogue — so the only way to hand somebody a file
 * on one click is to render it here. Chromium renders the page that already
 * exists, so the file and the screen cannot drift apart.
 *
 * ⚠ NEEDS A BROWSER ON THE SERVER — IN-11, the same constraint as the order
 * PDF. Fine locally; settle it with IN-01 before deploying.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params;

  /*
   * Checked here, BEFORE Chromium is launched.
   *
   * Launching a browser for a request that was never allowed is the most
   * expensive thing this application does, and the render below carries the
   * caller's cookies — so without this check the only thing between a stranger
   * and a supplier's invoice would be a page check running inside a browser we
   * paid to start.
   *
   * myInvoice() calls requireSupplier() itself, so it is scoped to whoever is
   * signed in: one supplier cannot fetch another's month by editing the URL.
   * A month with nothing in it is not a document, and gets the same 404.
   */
  const user = await getSessionUser();
  if (!user || user.role !== "Supplier") {
    return new NextResponse(null, { status: 404 });
  }

  const invoice = await myInvoice(month);
  if (!invoice || invoice.orderCount === 0) {
    return new NextResponse(null, { status: 404 });
  }

  // Imported here, not at the top: loading this module to build the route
  // table should not pull Chromium's wrapper in on every cold start.
  const { chromium } = await import("playwright");

  const origin = new URL(request.url).origin;
  const target = `${origin}/business-portal/invoices/${encodeURIComponent(month)}`;

  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext();

    // Forwarded as a raw header rather than parsed into structured cookies:
    // the page is fetched from this same origin and the header is what the
    // server reads. Access was settled above; this only lets it render.
    const cookie = request.headers.get("cookie");
    if (cookie) await context.setExtraHTTPHeaders({ cookie });

    const page = await context.newPage();
    await page.goto(target, { waitUntil: "networkidle", timeout: 30_000 });

    const pdf = await page.pdf({
      preferCSSPageSize: true,
      // The payment pill is meaning, not decoration — a printed invoice that
      // drops it loses the part saying whether it has been paid.
      printBackground: true,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        // attachment, not inline: the point is that clicking saves.
        "Content-Disposition": `attachment; filename="AussieMed-invoice-${month}.pdf"`,
        // Never cached. A month is unpaid until it is paid, and a stale copy
        // saying otherwise is worse than a slow one.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(`Invoice PDF render failed for ${month}:`, error);
    return NextResponse.json(
      {
        error: "pdf_unavailable",
        message:
          "The PDF could not be generated. The invoice can still be printed " +
          `from ${origin}/business-portal/invoices/${month}`,
      },
      { status: 503 }
    );
  } finally {
    await browser?.close();
  }
}
