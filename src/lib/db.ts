import "server-only";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma client singleton.
 *
 * Next's dev server re-evaluates modules on every hot reload, so a plain
 * `new PrismaClient()` opens a new connection each time until the database
 * runs out. Stashing it on globalThis keeps one across reloads.
 *
 * The `server-only` import above makes this a build error if a client
 * component ever imports it, rather than a confusing runtime failure.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function create() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

export const db = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
