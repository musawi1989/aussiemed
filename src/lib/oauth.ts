import "server-only";

/**
 * Signing in with Google.
 *
 * A seam, like storage.ts and mailer.ts, and for the same reason: no
 * credentials exist yet. Google OAuth needs a client id and secret from a
 * Google Cloud project tied to the client's own account and domain, which is
 * IN-05 and not something this codebase can produce.
 *
 * So the button is built and wired, and appears only when the keys are set.
 * A Google button that throws on click is worse than no button — it reads as
 * a broken site rather than a feature nobody has turned on yet.
 *
 * To turn it on, set both in .env and restart:
 *   GOOGLE_CLIENT_ID=...
 *   GOOGLE_CLIENT_SECRET=...
 */

export type GoogleProfile = {
  /** Google's stable id for the account. Never the email — people change those. */
  subject: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export function googleEnabled(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

function redirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/v1/auth/google/callback`;
}

/**
 * Where to send somebody to sign in with Google.
 *
 * `state` is a value we generated and stored; the callback refuses anything
 * that does not match. Without it, a third party can hand a victim a finished
 * sign-in link and land them in an account that is not theirs.
 */
export function googleAuthUrl(input: {
  origin: string;
  state: string;
  /** "signup" tells the callback to create an application, not just sign in. */
  intent: "signin" | "signup";
}): string | null {
  if (!googleEnabled()) return null;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: redirectUri(input.origin),
    response_type: "code",
    scope: "openid email profile",
    state: `${input.intent}:${input.state}`,
    // Google will not return an email we cannot trust to be theirs.
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchanges the code Google sent back for the profile behind it.
 *
 * Returns null rather than throwing on anything unexpected: this runs on a
 * redirect the user is watching, and a stack trace in the browser is both
 * useless to them and a gift to anyone probing.
 */
export async function exchangeGoogleCode(input: {
  code: string;
  origin: string;
}): Promise<GoogleProfile | null> {
  if (!googleEnabled()) return null;

  try {
    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: input.code,
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: redirectUri(input.origin),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) return null;

    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) return null;

    const profileResponse = await fetch(USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (!profileResponse.ok) return null;

    const profile = (await profileResponse.json()) as {
      sub?: string;
      email?: string;
      name?: string;
      email_verified?: boolean;
    };

    if (!profile.sub || !profile.email) return null;

    return {
      subject: profile.sub,
      email: profile.email.toLowerCase(),
      name: profile.name?.trim() || profile.email,
      emailVerified: profile.email_verified === true,
    };
  } catch {
    return null;
  }
}
