import Link from "next/link";
import { db } from "@/lib/db";
import { UrlFilters } from "@/components/UrlFilters";
import {
  actionLabel,
  areaLabel,
  areaOf,
  describeChange,
  entityLabel,
} from "@/lib/audit-trail";

/**
 * The audit trail.
 *
 * Every write the admin screens make lands here with who did it and what the
 * value was before. Entries are never edited or deleted, which is the whole
 * point, so there is no action on this screen at all.
 *
 * WHAT IT USED TO SHOW, AND WHY THAT WAS NOT ENOUGH. A row read
 * `supply.assign · ProductMaster · tiers: [object Object] → [object Object]`,
 * with the actor's first name in small grey type at the end. Every word of that
 * is accurate and none of it answers the question somebody opens this screen
 * with, which is always some version of "who changed this, and to what".
 *
 * So: the action and the record are named in business words, the change is
 * rendered field by field with only what actually moved, money is written in
 * AED rather than fils, and the person is given their own line with their role
 * beside them. The wording all lives in audit-trail.ts, which is pure and
 * tested; this file is the screen.
 *
 * FILTERED BY WHO AS WELL AS BY WHAT. "What did this person change last week"
 * was unanswerable without reading all two hundred entries, and it is the
 * question that matters once more than one person has an admin account.
 */

const PAGE_SIZE = 200;

/**
 * Which screen a record lives on — where the entry actually names it well
 * enough to get there.
 *
 * ENTITY IDS ARE NOT CONSISTENT, and pretending otherwise produces links that
 * 404. Different callers passed whatever identified the thing to them: an
 * order is sometimes its reference and sometimes its cuid, a supplier is
 * usually its trading name, a product is often its product name. See BE-78 —
 * the fix belongs at the call sites, not here.
 *
 * So the shape is checked before a link is offered. A row whose identifier
 * cannot address a page simply does not get a link, which is better than one
 * that looks like it works and does not. "Everything that happened to this
 * record" is always offered, because that filter matches on the stored value
 * whatever it happens to be.
 */
const CUID = /^c[a-z0-9]{20,}$/;
const ORDER_REF = /^AM-[A-Z0-9-]+$/i;
const PO_NUMBER = /^PO-[A-Z0-9-]+$/i;

function linkFor(entity: string, entityId: string): { href: string; label: string } | null {
  switch (entity) {
    case "ProductMaster":
      return CUID.test(entityId)
        ? { href: `/admin/products/${entityId}`, label: "Open the product" }
        : null;
    case "Order":
      return ORDER_REF.test(entityId)
        ? { href: `/admin/orders/${entityId}`, label: "Open the order" }
        : null;
    case "Supplier":
      return CUID.test(entityId)
        ? { href: `/admin/suppliers/${entityId}`, label: "Open the supplier" }
        : null;
    case "PurchaseOrder":
      return PO_NUMBER.test(entityId)
        ? { href: `/admin/purchasing/${entityId}`, label: "Open the purchase order" }
        : null;
    default:
      return null;
  }
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const v = params[key];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };

  const entity = one("entity");
  const entityId = one("id");
  const actor = one("actor");
  const area = one("area");
  const since = one("since");

  /**
   * The area filter is a prefix match on the action key, because that is how
   * the keys were already written — `order.*`, `purchaseOrder.*`. The grouping
   * existed in the data and only needed naming.
   */
  const sinceDate = since ? sinceCutoff(since) : null;

  const where = {
    ...(entity ? { entity } : {}),
    ...(entityId ? { entityId } : {}),
    ...(actor ? { actorUserId: actor } : {}),
    ...(area ? { action: { startsWith: `${area}.` } } : {}),
    ...(sinceDate ? { at: { gte: sinceDate } } : {}),
  };

  const [entries, total, actors, areasSeen, entitiesSeen] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { at: "desc" },
      take: PAGE_SIZE,
      include: { actor: { select: { id: true, name: true, email: true, role: true } } },
    }),
    db.auditLog.count({ where }),
    // Everyone who has ever written anything, so the dropdown lists the people
    // who are actually in the log rather than every admin account.
    db.auditLog.findMany({
      distinct: ["actorUserId"],
      where: { actorUserId: { not: null } },
      select: { actorUserId: true, actorName: true },
      orderBy: { actorName: "asc" },
    }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true } }),
    db.auditLog.findMany({ distinct: ["entity"], select: { entity: true } }),
  ]);

  const areas = [...new Set(areasSeen.map((row) => areaOf(row.action)))]
    .map((value) => ({ value, label: areaLabel(`${value}.x`) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const entities = entitiesSeen
    .map((row) => ({ value: row.entity, label: entityLabel(row.entity) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const filtered = Boolean(entity || entityId || actor || area || since);

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">Audit trail</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Every change made from the back office, who made it and what it was
          before. Nothing here can be edited or deleted — that is the point of
          it.
        </p>
        <p className="mt-1 text-sm tnum text-text-muted">
          {total} {total === 1 ? "entry" : "entries"}
          {total > PAGE_SIZE ? ` · showing the most recent ${PAGE_SIZE}` : ""}
          {entityId ? " for one record" : ""}
        </p>
      </div>

      <UrlFilters
        basePath="/admin/audit"
        carry={entityId ? { id: entityId } : {}}
        selects={[
          {
            name: "actor",
            label: "Who",
            value: actor,
            allLabel: "Anyone",
            options: actors
              .filter((row) => row.actorUserId)
              .map((row) => ({
                value: row.actorUserId as string,
                label: row.actorName ?? "No longer on record",
              })),
          },
          {
            name: "area",
            label: "What kind",
            value: area,
            allLabel: "Every kind of change",
            options: areas,
          },
          {
            name: "entity",
            label: "Record",
            value: entity,
            allLabel: "Every record",
            options: entities,
          },
          {
            name: "since",
            label: "When",
            value: since,
            allLabel: "Any time",
            options: [
              { value: "today", label: "Today" },
              { value: "7d", label: "Last 7 days" },
              { value: "30d", label: "Last 30 days" },
            ],
          },
        ]}
      />

      {entityId && (
        <p className="mt-3 text-sm">
          Showing one record only.{" "}
          <Link href="/admin/audit" className="font-semibold text-navy hover:underline">
            Show everything instead
          </Link>
        </p>
      )}

      {entries.length === 0 ? (
        <p className="mt-6 rounded-card border border-border-base bg-surface p-8 text-center text-text-muted">
          {filtered
            ? "Nothing matches those filters."
            : "Nothing recorded yet. Every admin change from here on will appear."}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {entries.map((entry) => {
            const changes = describeChange(entry.before, entry.after);
            const link = linkFor(entry.entity, entry.entityId);
            // The snapshot leads and the relation is the fallback, not the
            // other way round: the snapshot is what was true at the time.
            const who = entry.actorName ?? entry.actor?.name ?? null;
            const role = entry.actorRole ?? entry.actor?.role ?? null;

            return (
              <li
                key={entry.id}
                className="rounded-card border border-border-base bg-surface p-4 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-text">
                      {actionLabel(entry.action)}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      <span className="font-semibold">
                        {entityLabel(entry.entity)}
                      </span>{" "}
                      <span className="tnum text-text-subtle">{entry.entityId}</span>
                    </p>
                  </div>

                  {/* Who, on its own line and not in the margin. It is the
                      column people come here to read. */}
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-bold text-text">
                      {who ?? "No longer on record"}
                      {role && (
                        <span className="ml-1.5 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                          {role}
                        </span>
                      )}
                    </p>
                    <p className="text-xs tnum text-text-subtle">
                      {entry.at.toISOString().slice(0, 16).replace("T", " ")}
                      {entry.actor?.email && (
                        <span className="block">{entry.actor.email}</span>
                      )}
                    </p>
                  </div>
                </div>

                {changes.length > 0 ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[24rem] border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border-base text-left uppercase tracking-wide text-text-subtle">
                          <th scope="col" className="py-1 pr-4 font-bold">Field</th>
                          <th scope="col" className="py-1 pr-4 font-bold">Was</th>
                          <th scope="col" className="py-1 font-bold">Became</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.map((change) => (
                          <tr
                            key={change.field}
                            className="border-b border-border-base last:border-0 align-top"
                          >
                            <td className="py-1.5 pr-4 font-semibold text-text-muted">
                              {change.field}
                            </td>
                            <td className="whitespace-pre-line py-1.5 pr-4 tnum text-text-subtle">
                              {change.from}
                            </td>
                            <td
                              className={`whitespace-pre-line py-1.5 tnum font-semibold ${
                                change.removed ? "text-danger" : "text-text"
                              }`}
                            >
                              {change.to}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-2 text-xs italic text-text-subtle">
                    No field values were recorded against this one.
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {link && (
                    <Link
                      href={link.href}
                      className="text-xs font-semibold text-navy hover:underline"
                    >
                      {link.label} &rarr;
                    </Link>
                  )}
                  {!entityId && (
                    <Link
                      href={`/admin/audit?entity=${encodeURIComponent(entry.entity)}&id=${encodeURIComponent(entry.entityId)}`}
                      className="text-xs font-semibold text-navy hover:underline"
                    >
                      Everything that happened to this record &rarr;
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/**
 * Turns a filter word into a cutoff.
 *
 * "Today" is the calendar day in Asia/Dubai, not the last 24 hours. Somebody
 * asking what changed today means since this morning, and a rolling window
 * would show them yesterday evening's changes as today's.
 */
function sinceCutoff(key: string): Date | null {
  const now = new Date();

  if (key === "today") {
    const dubai = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dubai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    // Dubai is UTC+4 year round — no daylight saving to account for.
    return new Date(`${dubai}T00:00:00+04:00`);
  }

  const days = key === "7d" ? 7 : key === "30d" ? 30 : null;
  return days ? new Date(now.getTime() - days * 86_400_000) : null;
}
