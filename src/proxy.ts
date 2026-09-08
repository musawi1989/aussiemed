import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { expectedAuthorization, previewGate, safeEqual } from "@/lib/preview-gate";

/**
 * The shared-password gate. See src/lib/preview-gate.ts for why it exists.
 *
 * `proxy.ts`, not `middleware.ts`: the middleware file convention is deprecated
 * in Next 16 and renamed — see node_modules/next/dist/docs/01-app/03-api-
 * reference/03-file-conventions/proxy.md.
 *
 * NO MATCHER, DELIBERATELY. Without one the proxy runs on every request,
 * including /_next/static, images and everything in public/. That is normally
 * the mistake the docs warn about, because auth logic that catches the assets
 * stops the CSS loading. Here it is the requirement: a gate that lets the
 * stylesheets, the product photography and the API routes through while
 * challenging the pages is not a gate. Basic auth is re-sent by the browser on
 * every request, so the assets load fine once the password is in.
 */
export function proxy(request: NextRequest) {
  const gate = previewGate();
  // Not being shared: no gate, no cost, nothing changes locally.
  if (!gate) return NextResponse.next();

  const offered = request.headers.get("authorization") ?? "";
  if (safeEqual(offered, expectedAuthorization(gate))) return NextResponse.next();

  return new NextResponse("Not available.\n", {
    status: 401,
    headers: {
      // The realm is what the browser shows above the password box, so it says
      // where you are. charset=UTF-8 so a non-ASCII password survives.
      "WWW-Authenticate": 'Basic realm="AussieMed preview", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      // A cached 401 would keep challenging after the gate is lifted.
      "Cache-Control": "no-store",
      // Belt and braces over the site-wide noindex (IN-06): a tunnel hostname
      // should never be indexed even for the 401.
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
