import Link from "next/link";
import { db } from "@/lib/db";
import { AdminFilters } from "@/components/AdminFilters";

/**
 * The audit trail.
 *
 * Every write the admin screens make lands here with who did it and what the
 * value was before. A catalogue nobody can account for is worse than one
 * nobody can edit — this is the half of BE-06 that the admin build needed.
 *
 * Entries are never edited or deleted, which is the whole point, so there is
 * no action on this screen at all.
 */

const ENTITY_LABEL: Record<string, string> = {
  ProductMaster: "Product",
  ProductSku: "SKU",
  Supplier: "Supplier",
  Category: "Category",
  Order: "Order",
  Setting: "Setting",
};

/** Renders the JSON blob as "field: before → after" rather than raw JSON. */
function summarise(before: string | null, after: string | null): string[] {
  const parse = (v: string | null): Record<string, unknown> => {
    if (!v) return {};
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : { value: parsed };
    } catch {
      return { value: v };
    }
  };

  const b = parse(before);
  const a = parse(after);
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];

  const show = (v: unknown) =>
    v === undefined || v === null || v === ""
      ? "—"
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);

  return keys.map((key) => `${key}: ${show(b[key])} → ${show(a[key])}`);
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

  const entries = await db.auditLog.findMany({
    where: {
      ...(entity ? { entity } : {}),
      ...(entityId ? { entityId } : {}),
    },
    orderBy: { at: "desc" },
    take: 200,
    include: { actor: { select: { name: true, email: true } } },
  });

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">Audit trail</h1>
        <p className="mt-1 text-sm text-text-muted tnum">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
          {entries.length === 200 ? " (most recent 200)" : ""}
          {entityId ? " for one record" : ""}
        </p>
      </div>

      <AdminFilters
        basePath="/admin/audit"
        selects={[
          {
            name: "entity",
            label: "Everything",
            value: entity,
            options: Object.entries(ENTITY_LABEL).map(([value, label]) => ({
              value,
              label,
            })),
          },
        ]}
      />

      {entityId && (
        <p className="mt-3 text-sm">
          <Link href="/admin/audit" className="font-semibold text-navy hover:underline">
            Show everything instead
          </Link>
        </p>
      )}

      {entries.length === 0 ? (
        <p className="mt-6 rounded-card border border-border-base bg-surface p-8 text-center text-text-muted">
          Nothing recorded yet. Every admin change from here on will appear.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {entries.map((entry) => {
            const lines = summarise(entry.before, entry.after);
            return (
              <li
                key={entry.id}
                className="rounded-card border border-border-base bg-surface p-4 shadow-card"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-text">
                    {entry.action}
                    <span className="ml-2 font-normal text-text-muted">
                      {ENTITY_LABEL[entry.entity] ?? entry.entity}
                    </span>
                  </p>
                  <p className="text-xs tnum text-text-subtle">
                    {entry.at.toISOString().slice(0, 16).replace("T", " ")} &middot;{" "}
                    {entry.actor?.name ?? "unknown"}
                  </p>
                </div>

                {lines.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {lines.map((line) => (
                      <li
                        key={line}
                        className="break-words text-xs tnum text-text-muted"
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                )}

                {entry.entity === "ProductMaster" && (
                  <Link
                    href={`/admin/products/${entry.entityId}`}
                    className="mt-2 inline-block text-xs font-semibold text-navy hover:underline"
                  >
                    Open the product &rarr;
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
