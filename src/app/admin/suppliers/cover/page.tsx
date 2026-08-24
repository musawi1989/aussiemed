import { db } from "@/lib/db";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { UrlFilters } from "@/components/UrlFilters";
import { CoverTable } from "@/components/admin/CoverTable";
import { listCover } from "@/lib/supply-cover";
import { SUPPLIER_TABS } from "../tabs";

/**
 * Who covers what.
 *
 * The ranks existed from the beginning and nothing could set them: cover
 * arrived with a catalogue import and changing it meant importing again. This
 * is the screen for the two jobs that actually come up — moving one pack to a
 * different supplier, and moving the forty a new supplier has just taken on.
 *
 * ONE PAGE, CAPPED. The catalogue is thousands of packs, so this shows the
 * first hundred that match and says so. The filters are the way through it,
 * which is why "missing a primary" is one of them: that list is the reason
 * somebody opens this screen unprompted.
 */
export default async function SupplyCoverPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    supplierId?: string;
    missing?: string;
    categoryId?: string;
  }>;
}) {
  const filters = await searchParams;

  const LIMIT = 100;
  const [rows, suppliers, categories] = await Promise.all([
    listCover(filters, LIMIT),
    // Every supplier, not just the available ones. isAvailable is a
    // this-week fact — closed, on holiday — and a supplier who currently
    // holds a rank must still appear in the select, or the row would read
    // "nobody" while the database says otherwise.
    db.supplier.findMany({
      orderBy: [{ status: "asc" }, { companyName: "asc" }],
      select: { id: true, companyName: true },
    }),
    db.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const supplierOptions = suppliers.map((s) => ({
    id: s.id,
    name: s.companyName,
  }));

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">Suppliers</h1>
        <p className="mt-1 text-sm text-text-muted">
          Who supplies each pack, and who covers it when they cannot.
        </p>
      </div>

      <SectionTabs tabs={SUPPLIER_TABS} />

      <div className="mt-5">
        <h2 className="text-base font-bold tracking-tight text-text">Cover</h2>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Every pack has one primary supplier and one backup. The primary
          receives the purchase order; the backup receives it when the primary
          cannot supply.{" "}
          <span className="font-semibold text-text">
            Suppliers are not told which they are.
          </span>
        </p>
      </div>

      <UrlFilters
        basePath="/admin/suppliers/cover"
        searchName="q"
        searchValue={filters.q ?? ""}
        searchPlaceholder="Item, SKU or their part number"
        selects={[
          {
            name: "supplierId",
            label: "Supplier",
            value: filters.supplierId ?? "",
            options: supplierOptions.map((s) => ({
              value: s.id,
              label: s.name,
            })),
          },
          {
            name: "categoryId",
            label: "Category",
            value: filters.categoryId ?? "",
            options: categories.map((c) => ({ value: c.id, label: c.name })),
          },
          {
            // The reason to open this screen without being sent to it.
            name: "missing",
            label: "Gaps",
            value: filters.missing ?? "",
            options: [
              { value: "primary", label: "No primary" },
              { value: "backup", label: "No backup" },
            ],
          },
        ]}
      />

      <p className="mt-3 text-xs text-text-subtle tnum">
        {rows.length === LIMIT
          ? `Showing the first ${LIMIT} matches. Narrow the filters to see the rest.`
          : `${rows.length} ${rows.length === 1 ? "pack" : "packs"}`}
      </p>

      <CoverTable rows={rows} suppliers={supplierOptions} />
    </>
  );
}
