import "server-only";
import { existsSync } from "node:fs";
import { previewGate } from "./preview-gate";

/** Render only our own document, with credentials confined to the loopback origin. */
export async function renderDocumentPdf(path: string, cookies: { name: string; value: string }[]) {
  const { chromium } = await import("playwright");
  const port = Number(process.env.PORT || process.env.AUSSIEMED_LOCAL_PORT || (process.env.AUSSIEMED_LOCAL_PREVIEW === "1" ? 3001 : 3000));
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Invalid PDF document configuration");
  }
  const origin = `http://127.0.0.1:${port}`;
  const executablePath = [
    process.env.PDF_BROWSER_PATH,
    chromium.executablePath(),
    ...(process.platform === "win32" ? [
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ] : []),
  ].find((file): file is string => Boolean(file && existsSync(file)));
  if (!executablePath) throw new Error("Install Playwright Chromium or configure PDF_BROWSER_PATH.");
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const gate = previewGate();
    const context = await browser.newContext({
      ...(gate ? { httpCredentials: { origin, username: gate.username, password: gate.password } } : {}),
    });
    await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: origin, httpOnly: true, sameSite: "Lax" as const })));
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      await route.continue();
    });
    const page = await context.newPage();
    const response = await page.goto(origin + path, { waitUntil: "networkidle", timeout: 60_000 });
    if (!response?.ok() || !await page.locator(".print-document").count()) {
      throw new Error(`Document did not load (${response?.status() ?? "no response"})`);
    }
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>(".print-document img"), async img => {
        try { await img.decode(); } catch { img.replaceWith(Object.assign(document.createElement("span"), { textContent: "Image unavailable" })); }
      }));
    });
    return await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close();
  }
}
