import Link from "next/link";
import { db } from "@/lib/db";
import { formatAED } from "@/lib/money";
import { StatusPill } from "@/components/StatusPill";
import { SupplierForm } from "@/components/SupplierForm";

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
                    {aed(
                      supplier.purchaseOrders.reduce(
                        (n, po) => n + po.totalCostFils,
                        0
                      )
                    )}
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
