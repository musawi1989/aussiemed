/**
 * One shared password in front of the entire site, for the times it is exposed
 * to the internet through a Cloudflare quick tunnel so somebody off this
 * machine can look at it.
 *
 * WHY THIS EXISTS. The site is not deployed and is not meant to be public, but
 * a tunnel is public — a *.trycloudflare.com hostname is reachable by anyone
 * who has it. Everything behind it is real business shape: supplier cost
 * prices, margins, customer accounts, the buying run. And every seeded account
 * shares the password `123456` (SEC-01), including `admin`, so an unguarded
 * tunnel is not "a preview", it is the back office with the door open.
 *
 * WHY HTTP BASIC. It is the only auth a browser will hold across every request
 * — pages, assets, API routes, the PDF render — with no login page to build,
 * no session to store and nothing left behind in the app when the tunnel ends.
 * It is not the application's authentication and does not replace it: the
 * three doors (DEC-09) still work exactly as before. This is a bouncer at the
 * street entrance, not a change to who can sign in.
 *
 * OFF BY DEFAULT. With no PREVIEW_PASSWORD set there is no gate at all, so
 * local development is untouched. Setting the variable is the deliberate act
 * of exposing the site, which is why the switch is the secret itself rather
 * than a separate PREVIEW_ENABLED flag somebody could set without choosing a
 * password.
 */

export type PreviewGate = { username: string; password: string };

/** The gate's credentials, or null when the site is not being shared. */
export function previewGate(): PreviewGate | null {
  const password = process.env.PREVIEW_PASSWORD?.trim();
  if (!password) return null;
  // The username is not a secret and nobody should have to be told it twice.
  return { username: process.env.PREVIEW_USER?.trim() || "aussiemed", password };
}

/** The exact `Authorization` header value a correct client will send. */
export function expectedAuthorization(gate: PreviewGate): string {
  return `Basic ${btoa(`${gate.username}:${gate.password}`)}`;
}

/**
 * Constant time for equal-length inputs.
 *
 * node:crypto's timingSafeEqual is not available in the proxy, which runs on
 * the edge runtime, so this is the same idea written by hand: compare every
 * character every time. The length is allowed to leak — the length of a
 * password nobody is guessing character-by-character is not what protects it,
 * and returning early on a mismatch is what would.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
