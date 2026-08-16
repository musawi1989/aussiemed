import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatAED } from "@/lib/money";
import { StatusPill } from "@/components/StatusPill";
import { SupplierForm } from "@/components/SupplierForm";

const aed = (fils: number) => formatAED(fils / 100);

export default async function AdminSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supplier = await db.supplier.findUnique({
    where: { id },
    include: {
      user: { select: { username: true, email: true, name: true } },
      // What they can supply, and what we have bought. A supplier no longer
      // owns products or appears on a customer's invoice.
      supplies: {
        orderBy: { rank: "asc" },
        select: {
          rank: true,
          costFils: true,
          isAvailable: true,
          sku: {
            select: {
              skuCode: true,
              unitLabel: true,
              product: { select: { id: true, name: true, status: true } },
            },
          },
        },
      },
      purchaseOrders: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          poNumber: true,
          status: true,
          totalCostFils: true,
          createdAt: true,
        },
      },
    },
  });

  if (!supplier) notFound();

  return (
    <>
      <div className="mt-6">
        <Link
          href="/admin/suppliers"
          className="text-sm font-semibold text-text-muted hover:text-navy"
        >
          &larr; All suppliers
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight text-text">
          {supplier.companyName}
          <StatusPill status={supplier.status} />
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {supplier.user
            ? `Portal login: ${supplier.user.username ?? supplier.user.email}`
            : "No portal login — this supplier cannot sign in yet."}
        </p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <SupplierForm
          supplier={{
            id: supplier.id,
            companyName: supplier.companyName,
            primaryEmail: supplier.primaryEmail,
            secondaryEmail: supplier.secondaryEmail,
            phone: supplier.phone,
            address: supplier.address,
            trn: supplier.trn,
            status: supplier.status,
          }}
        />

        <div className="space-y-5">
          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              Packs they supply ({supplier.supplies.length})
            </h2>
            {supplier.supplies.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">
                Nothing is sourced from this supplier yet.
              </p>
            ) : (
              <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1">
                {supplier.supplies.map((supply) => (
                  <li
                    key={`${supply.sku.skuCode}-${supply.rank}`}
                    className="flex items-center gap-2"
                  >
                    <Link
                      href={`/admin/products/${supply.sku.product.id}`}
                      className="flex-1 truncate text-sm text-navy hover:underline"
                    >
                      {supply.sku.product.name}
                      <span className="ml-1 text-xs text-text-subtle tnum">
                        {supply.sku.unitLabel}
                      </span>
                    </Link>
                    <span className="shrink-0 text-xs tnum text-text-muted">
                      {supply.costFils === null ? "no cost" : aed(supply.costFils)}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        supply.rank === "Primary"
                          ? "bg-navy-soft text-navy"
                          : "bg-surface-sunken text-text-muted"
                      }`}
                    >
                      {supply.rank}
                    </span>
                    {!supply.isAvailable && (
                      <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">
                        unavailable
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              Recent purchase orders
            </h2>
            {supplier.purchaseOrders.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">
                Nothing has been ordered from this supplier yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {supplier.purchaseOrders.map((po) => (
                  <li
                    key={po.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <Link
                      href={`/admin/purchasing/${po.poNumber}`}
                      className="font-semibold tnum text-navy hover:underline"
                    >
                      {po.poNumber}
                    </Link>
                    <span className="flex items-center gap-2">
                      <StatusPill status={po.status} />
                      <span className="font-semibold tnum text-text">
                        {po.totalCostFils > 0 ? aed(po.totalCostFils) : "—"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
