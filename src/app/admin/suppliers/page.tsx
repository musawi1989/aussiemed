import Link from "next/link";
import { db } from "@/lib/db";
import { formatAED } from "@/lib/money";
import { StatusPill } from "@/components/StatusPill";
import { SupplierForm } from "@/components/SupplierForm";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { SUPPLIER_TABS } from "./tabs";

const aed = (fils: number) => formatAED(fils / 100);

export default async function AdminSuppliersPage() {
  const suppliers = await db.supplier.findMany({
    orderBy: [{ status: "asc" }, { companyName: "asc" }],
    include: {
      // What a supplier costs us and how much of the catalogue they cover,
      // counted from what actually exists now: packs they can supply, and
      // purchase orders we have raised. The old counts were products they
      // "owned" and customer invoices in their name, neither of which is how
      // this works any more.
      _count: { select: { supplies: true, purchaseOrders: true } },
      purchaseOrders: { select: { totalCostFils: true } },
      user: { select: { username: true, email: true } },
    },
  });

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">Suppliers</h1>
        <p className="mt-1 text-sm text-text-muted tnum">
          {suppliers.length} {suppliers.length === 1 ? "supplier" : "suppliers"}
        </p>
      </div>

      <SectionTabs tabs={SUPPLIER_TABS} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-x-auto rounded-card border border-border-base bg-surface shadow-card">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-border-base bg-surface-sunken text-left">
              <tr>
                <th className="px-4 py-2.5 font-bold text-text-subtle">Supplier</th>
                <th className="px-4 py-2.5 font-bold text-text-subtle">Status</th>
                <th className="px-4 py-2.5 text-right font-bold text-text-subtle">
                  Packs supplied
                </th>
                <th className="px-4 py-2.5 text-right font-bold text-text-subtle">
                  Ordered from
                </th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr
                  key={supplier.id}
                  className="border-b border-border-base last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/suppliers/${supplier.id}`}
                      className="font-semibold text-navy hover:underline"
                    >
                      {supplier.companyName}
                    </Link>
                    <p className="mt-0.5 text-xs text-text-subtle">
                      {supplier.primaryEmail}
                      {supplier.user?.username
                        ? ` · signs in as ${supplier.user.username}`
                        : " · no portal login"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={supplier.status} />
                  </td>
                  <td className="px-4 py-3 text-right tnum text-text-muted">
                    {supplier._count.supplies}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tnum text-text">
                    {/* Totalling only the orders whose cost is known, and
                        saying so, rather than counting the rest as free. */}
                    {(() => {
                      const known = supplier.purchaseOrders.filter(
                        (po) => po.totalCostFils !== null
                      );
                      if (known.length === 0) return "—";
                      const total = known.reduce(
                        (n, po) => n + (po.totalCostFils ?? 0),
                        0
                      );
                      const missing =
                        supplier.purchaseOrders.length - known.length;
                      return (
                        <>
                          {aed(total)}
                          {missing > 0 && (
                            <span
                              className="ml-1 text-xs font-normal text-text-subtle"
                              title={`${missing} order(s) have no recorded cost and are not counted`}
                            >
                              +{missing}?
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <SupplierForm />
      </div>
    </>
  );
}
