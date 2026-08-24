import { db } from "@/lib/db";
import { UrlFilters } from "@/components/UrlFilters";
import { BackorderTable } from "@/components/admin/BackorderTable";
import { allBackorders } from "@/lib/backorders";

/**
 * Everything a supplier has told us they cannot send.
 *
 * This is the screen that makes qtyConfirmed worth collecting. A supplier
 * saying "eight of the ten" used to be a phone call; it is now a number, and
 * this is where somebody does something about the other two.
 *
 * ONLY CONFIRMED SHORTFALLS APPEAR. A line the supplier has not answered is
 * not a back order — it is a chase — and re-sourcing on silence would move
 * orders nobody declined. That distinction is enforced in shortfallOf and
 * tested there.
 */
export default async function BackordersPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string }>;
}) {
  const filters = await searchParams;

  const [lines, suppliers] = await Promise.all([
    allBackorders(filters),
    db.supplier.findMany({
      orderBy: [{ status: "asc" }, { companyName: "asc" }],
      select: { id: true, companyName: true },
    }),
  ]);

  const units = lines.reduce((n, l) => n + l.shortfall, 0);

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">
          Back orders
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Lines a supplier has told us they cannot send in full. Tick what you
          want to buy elsewhere and raise a draft order to another supplier for
          the total.{" "}
          <span className="font-semibold text-text">
            The customer demand moves with it
          </span>{" "}
          — nothing is left waiting on an order that will not deliver.
        </p>
        <p className="mt-2 text-sm tnum text-text-muted">
          {lines.length === 0
            ? "Nothing outstanding"
            : `${units} ${units === 1 ? "unit" : "units"} across ${lines.length} ${lines.length === 1 ? "line" : "lines"}`}
        </p>
      </div>

      <UrlFilters
        basePath="/admin/purchasing/backorders"
        selects={[
          {
            name: "supplierId",
            label: "Supplier",
            allLabel: "All suppliers",
            value: filters.supplierId ?? "",
            options: suppliers.map((s) => ({ value: s.id, label: s.companyName })),
          },
        ]}
      />

      <BackorderTable
        lines={lines.map((line) => ({
          lineId: line.lineId,
          poNumber: line.poNumber,
          supplierId: line.supplierId,
          supplierName: line.supplierName,
          skuCode: line.skuCode,
          name: line.name,
          qtyOrdered: line.qtyOrdered,
          qtyConfirmed: line.qtyConfirmed,
          shortfall: line.shortfall,
        }))}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.companyName }))}
      />
    </>
  );
}
