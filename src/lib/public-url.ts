/**
 * The address a link in an email should point at.
 *
 * Emails are the one place the application has to know its own public URL: a
 * relative link is meaningless in an inbox. Hosting is IN-01 and undecided, so
 * this reads an environment variable and falls back to the development server
 * rather than hard-coding a domain that will be wrong.
 *
 * The fallback is deliberately localhost and not a guess at aussiemed.com. A
 * link to a domain that is not serving yet looks like a dead site; a link to
 * localhost in an outbox file is obviously a development artefact.
 */
export function publicUrl(): string {
  const configured = (process.env.PUBLIC_URL ?? "").trim();
  const base = configured || "http://localhost:3000";
  return base.replace(/\/+$/, "");
}
