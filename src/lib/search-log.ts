import "server-only";

import { db } from "./db";
import { getSessionUser } from "./auth";
import { isLoggableSearch, normaliseSearch } from "./lifecycle";

/**
 * Writing down what people searched for — BE-32.
 *
 * A search that returns nothing is a customer telling you what to stock, and
 * it was being thrown away. Like the status log this cannot be repaired later:
 * nobody can recall next quarter what a visitor typed last month.
 *
 * Only submitted searches reach here — the search box suggests from a snapshot
 * in the browser and never round-trips, so a row per keystroke was never
 * possible, which is just as well. It also never throws: a page must render
 * even if the logging fails.
 */

/**
 * Two searches from the same visitor within this window count as one.
 *
 * Paging through results re-runs the same query, and a back button re-runs it
 * again. Without this, one person looking at three pages of gloves would look
 * like three people wanting gloves, and the number that matters — how many
 * searches found nothing — would be inflated by whoever was most persistent.
 */
const DEDUPE_WINDOW_MS = 5 * 60_000;

export async function logSearch(input: {
  term: string | undefined | null;
  resultCount: number;
  categoryScope?: string | null;
}): Promise<void> {
  const term = (input.term ?? "").trim();
  if (!isLoggableSearch(term)) return;

  try {
    const normalised = normaliseSearch(term);
    const user = await getSessionUser();

    const recent = await db.searchEvent.findFirst({
      where: {
        normalised,
        userId: user?.id ?? null,
        categoryScope: input.categoryScope ?? null,
        at: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (recent) return;

    await db.searchEvent.create({
      data: {
        term,
        normalised,
        resultCount: Math.max(0, Math.trunc(input.resultCount)),
        categoryScope: input.categoryScope ?? null,
        userId: user?.id ?? null,
      },
    });
  } catch (error) {
    // A page must render even if this fails.
    console.error("[search] could not record a search:", error);
  }
}

export type SearchReportRow = {
  normalised: string;
  /** The most recent spelling, for reading. */
  term: string;
  times: number;
  lastAt: Date;
  /** Best result count seen. Zero every time is the interesting case. */
  bestResultCount: number;
};

/**
 * What people looked for, grouped.
 *
 * Grouped by the normalised term rather than listed raw, because forty rows of
 * "gloves" is a fact about one demand, not forty. Ordered by how often, so the
 * top of the list is the strongest signal.
 */
export async function searchReport(options: {
  emptyOnly?: boolean;
  sinceDays?: number;
  limit?: number;
}): Promise<SearchReportRow[]> {
  const since = new Date(
    Date.now() - (options.sinceDays ?? 90) * 24 * 3_600_000
  );

  const rows = await db.searchEvent.findMany({
    where: {
      at: { gte: since },
      ...(options.emptyOnly ? { resultCount: 0 } : {}),
    },
    orderBy: { at: "desc" },
    select: { normalised: true, term: true, resultCount: true, at: true },
    take: 5_000,
  });

  const byTerm = new Map<string, SearchReportRow>();
  for (const row of rows) {
    const existing = byTerm.get(row.normalised);
    if (!existing) {
      byTerm.set(row.normalised, {
        normalised: row.normalised,
        term: row.term,
        times: 1,
        lastAt: row.at,
        bestResultCount: row.resultCount,
      });
      continue;
    }
    existing.times += 1;
    if (row.at > existing.lastAt) {
      existing.lastAt = row.at;
      existing.term = row.term;
    }
    // The best they ever saw. A term that found nothing once and something
    // later is not a gap in the catalogue.
    existing.bestResultCount = Math.max(existing.bestResultCount, row.resultCount);
  }

  return [...byTerm.values()]
    .sort((a, b) => b.times - a.times || b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, options.limit ?? 100);
}

export async function searchCounts(): Promise<{ total: number; empty: number }> {
  const since = new Date(Date.now() - 90 * 24 * 3_600_000);
  const [total, empty] = await Promise.all([
    db.searchEvent.count({ where: { at: { gte: since } } }),
    db.searchEvent.count({ where: { at: { gte: since }, resultCount: 0 } }),
  ]);
  return { total, empty };
}
