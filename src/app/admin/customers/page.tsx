import Link from "next/link";
import { db } from "@/lib/db";
import { formatAED } from "@/lib/money";
import { AdminFilters } from "@/components/AdminFilters";
import { StatusPill } from "@/components/StatusPill";

const aed = (fils: number) => formatAED(fils / 100);

/**
 * Customers, read-only.
 *
 * Editing an account is deliberately not here yet: credit limits and payment
 * terms are an accounting decision that has not been made (AC-09), and a
 * screen that lets someone set them before the policy exists invites a number
 * that later turns out to be wrong.
 */
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const v = params.q;
  const q = ((Array.isArray(v) ? v[0] : v) ?? "").trim();

  const customers = await db.user.findMany({
    where: {
      role: "Customer",
      ...(q
        ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      organisation: { select: { name: true, paymentTerms: true, trn: true } },
      orders: { select: { totalFils: true } },
    },
  });

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">Customers</h1>
        <p className="mt-1 text-sm text-text-muted tnum">
          {customers.length} {customers.length === 1 ? "account" : "accounts"}
        </p>
      </div>

      <AdminFilters
        basePath="/admin/customers"
        searchName="q"
        searchValue={q}
        searchPlaceholder="Name or email"
      />

      {customers.length === 0 ? (
        <p className="mt-6 rounded-card border border-border-base bg-surface p-8 text-center text-text-muted">
          No customer accounts match.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-border-base bg-surface shadow-card">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-border-base bg-surface-sunken text-left">
              <tr>
                <th className="px-4 py-2.5 font-bold text-text-subtle">Customer</th>
                <th className="px-4 py-2.5 font-bold text-text-subtle">
                  Organisation
                </th>
                <th className="px-4 py-2.5 font-bold text-text-subtle">Terms</th>
                <th className="px-4 py-2.5 text-right font-bold text-text-subtle">
                  Orders
                </th>
                <th className="px-4 py-2.5 text-right font-bold text-text-subtle">
                  Spent
                </th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b border-border-base last:border-0"
                >
                  <td className="px-4 py-3">
                    <span className="font-semibold text-text">
                      {customer.name}
                    </span>
                    {customer.isDisabled && (
                      <span className="ml-2">
                        <StatusPill status="Disabled" />
                      </span>
                    )}
                    <p className="mt-0.5 text-xs text-text-subtle">
                      {customer.email}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {customer.organisation?.name ?? "—"}
                    {customer.organisation && !customer.organisation.trn && (
                      <p className="mt-0.5 text-xs text-danger">no TRN</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {customer.organisation?.paymentTerms ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tnum text-text-muted">
                    {customer.orders.length}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tnum text-text">
                    {aed(customer.orders.reduce((n, o) => n + o.totalFils, 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-text-subtle">
        Read-only for now. Credit limits and payment terms wait on AC-09, and no
        TRN is captured anywhere yet — AC-03, which order documents need before
        they are compliant UAE tax invoices.{" "}
        <Link href="/admin/settings" className="font-semibold text-navy hover:underline">
          Settings
        </Link>
      </p>
    </>
  );
}
