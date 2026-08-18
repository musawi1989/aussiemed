/**
 * Text search that means the same thing on both databases — IN-02.
 *
 * Prisma turns `contains` into LIKE, and the two engines disagree about what
 * LIKE means. SQLite matches ASCII case-insensitively, so searching "dubai"
 * finds "Dubai Medical" today. Postgres does not: the same search finds
 * nothing until the filter says `mode: "insensitive"`, which switches it to
 * ILIKE.
 *
 * That is the worst shape of portability bug — nothing fails, no error is
 * raised, the admin search simply stops finding things on the day the site
 * goes live. The client chose Postgres on 18 Aug (DEC-32), so this seam exists
 * to make that day mechanical: the provider is read from the connection string
 * and every search asks for the same behaviour on either engine.
 *
 * `mode` is added by hand rather than typed, because the Prisma client
 * generated against SQLite has no QueryMode at all and would refuse to compile
 * it. The cast is confined to this one function so no call site has to know.
 */

export type Provider = "sqlite" | "postgresql";

/** Read from the URL rather than a second env var nobody remembers to set. */
export function providerFor(url: string | undefined): Provider {
  return /^postgres(ql)?:\/\//i.test(url ?? "") ? "postgresql" : "sqlite";
}

export type ContainsFilter = { contains: string };

/**
 * Pure, so the branch is tested without a database and without switching one.
 * Returns the filter Prisma should receive for this provider.
 */
export function containsFilter(value: string, provider: Provider): ContainsFilter {
  const filter: ContainsFilter = { contains: value };
  if (provider === "postgresql") {
    (filter as ContainsFilter & { mode?: string }).mode = "insensitive";
  }
  return filter;
}

/** What every screen calls. One line, so nobody writes a raw `contains` again. */
export function contains(value: string): ContainsFilter {
  return containsFilter(value, providerFor(process.env.DATABASE_URL));
}
