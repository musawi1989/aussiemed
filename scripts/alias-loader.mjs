// Resolves the project's "@/" alias and the extensionless imports Next infers,
// so a plain node script can import the same modules the app does.
// Verification only — nothing ships depending on this.
import { existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve as resolvePath, dirname } from "node:path";

const src = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "src");

const firstThatExists = (base) => {
  for (const c of [base, base + ".ts", base + ".tsx", resolvePath(base, "index.ts")]) {
    if (existsSync(c)) return c;
  }
  return null;
};

const STUBS = {
  "next/headers": "stubs/next-headers.mjs",
  "next/cache": "stubs/next-cache.mjs",
  "server-only": "stubs/server-only.mjs",
};

export function resolve(specifier, context, next) {
  const stub = STUBS[specifier];
  if (stub) {
    return next(new URL(stub, import.meta.url).href, context);
  }

  let base = null;

  if (specifier.startsWith("@/")) {
    base = resolvePath(src, specifier.slice(2));
  } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
  }

  if (base) {
    const hit = firstThatExists(base);
    if (hit) return next(pathToFileURL(hit).href, context);
  }
  return next(specifier, context);
}
