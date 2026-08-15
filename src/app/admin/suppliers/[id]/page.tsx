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
      products: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, status: true },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { order: { select: { reference: true } } },
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
              Products ({supplier.products.length})
            </h2>
            {supplier.products.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">
                Nothing in the catalogue from this supplier.
              </p>
            ) : (
              <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto pr-1">
                {supplier.products.map((product) => (
                  <li key={product.id} className="flex items-center gap-2">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="flex-1 truncate text-sm text-navy hover:underline"
                    >
                      {product.name}
                    </Link>
                    <StatusPill status={product.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              Recent invoices
            </h2>
            {supplier.invoices.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">
                No orders have been raised against this supplier.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {supplier.invoices.map((invoice) => (
                  <li
                    key={invoice.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <Link
                      href={`/admin/orders/${invoice.order.reference}`}
                      className="font-semibold tnum text-navy hover:underline"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                    <span className="flex items-center gap-2">
                      <StatusPill status={invoice.status} />
                      <span className="font-semibold tnum text-text">
                        {aed(invoice.totalFils)}
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
