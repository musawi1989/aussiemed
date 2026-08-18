import Link from "next/link";
import { db } from "@/lib/db";
import { countryName } from "@/lib/geo";
import { formatAED } from "@/lib/money";
import { AdminFilters } from "@/components/AdminFilters";
import { StatusPill } from "@/components/StatusPill";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { CUSTOMER_TABS } from "./tabs";

const aed = (fils: number) => formatAED(fils / 100);

/**
 * Customer accounts.
 *
 * This listed people, not accounts, and that stopped being right the moment an
 * admin could open an account before anybody signed in against it (FN-19): an
 * account with no user simply did not appear, so the screen would have hidden
 * exactly the records this screen exists to manage. It lists organisations now,
 * with their people underneath, and keeps a section for any customer who has no
 * account at all — nothing that exists is allowed to be invisible here.
 *
 * Editing is limited on purpose. Payment terms and credit limits are an
 * accounting decision nobody has taken (AC-09), so they are not offered; the
 * name, TRN, country, region and standing notes are.
 */
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const v = params.q;
  const q = ((Array.isArray(v) ? v[0] : v) ?? "").trim();

  const accounts = await db.organisation.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { trn: { contains: q } },
            { users: { some: { name: { contains: q } } } },
            { users: { some: { email: { contains: q } } } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      trn: true,
      paymentTerms: true,
      isDisabled: true,
      isSelfRegistered: true,
      countryCode: true,
      users: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, approvalStatus: true },
      },
      orders: { select: { totalFils: true } },
    },
  });

  // A customer sign-in with no account behind it. Seeded rows and anything
  // created before applications existed land here; they would otherwise vanish
  // from the only screen that lists customers.
  const unattached = await db.user.findMany({
    where: {
      role: "Customer",
      organisationId: null,
      ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true },
  });

  return (
    <>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">Customers</h1>
          <p className="mt-1 text-sm text-text-muted tnum">
            {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
          </p>
        </div>
        <Link
          href="/admin/customers/new"
          className="rounded-card bg-navy px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-hover"
        >
          Open an account
        </Link>
      </div>

      <SectionTabs tabs={CUSTOMER_TABS} />

      <AdminFilters
        basePath="/admin/customers"
        searchName="q"
        searchValue={q}
        searchPlaceholder="Account, person, email or TRN"
      />

      {accounts.length === 0 ? (
        <p className="mt-6 rounded-card border border-border-base bg-surface p-8 text-center text-text-muted">
          No customer accounts match.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-border-base bg-surface shadow-card">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="border-b border-border-base bg-surface-sunken text-left">
              <tr>
                <th className="px-4 py-2.5 font-bold text-text-subtle">Account</th>
                <th className="px-4 py-2.5 font-bold text-text-subtle">
                  Who signs in
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
              {accounts.map((account) => (
                <tr
                  key={account.id}
                  className="border-b border-border-base last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/customers/${account.id}`}
                      className="font-semibold text-navy hover:underline"
                    >
                      {account.name}
                    </Link>
                    {account.isDisabled && (
                      <span className="ml-2">
                        <StatusPill axis="record" status="Disabled" />
                      </span>
                    )}
                    <p className="mt-0.5 text-xs text-text-subtle">
                      {countryName(account.countryCode) ?? account.countryCode}
                      {account.isSelfRegistered && " · applied online"}
                    </p>
                    {!account.trn && (
                      <p className="mt-0.5 text-xs text-danger">no TRN</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {account.users.length === 0 ? (
                      <span className="text-text-subtle">nobody yet</span>
                    ) : (
                      account.users.map((user) => (
                        <p key={user.id} className="leading-snug">
                          {user.name}
                          <span className="block text-xs text-text-subtle">
                            {user.email}
                            {user.approvalStatus !== "Approved" &&
                              ` · ${user.approvalStatus.toLowerCase()}`}
                          </span>
                        </p>
                      ))
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {account.paymentTerms}
                  </td>
                  <td className="px-4 py-3 text-right tnum text-text-muted">
                    {account.orders.length}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tnum text-text">
                    {aed(account.orders.reduce((n, o) => n + o.totalFils, 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unattached.length > 0 && (
        <div className="mt-6 rounded-card border border-border-base bg-surface p-4 shadow-card">
          <h2 className="text-xs font-bold uppercase tracking-wide text-text-subtle">
            Sign-ins with no account ({unattached.length})
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            These people can sign in but belong to no organisation, so nothing
            they order can be invoiced to an account.
          </p>
          <ul className="mt-3 space-y-1.5">
            {unattached.map((user) => (
              <li key={user.id} className="text-sm text-text">
                {user.name}
                <span className="ml-2 text-xs text-text-subtle">{user.email}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-text-subtle">
        Payment terms and credit limits are not editable: they wait on AC-09. A
        TRN can be set here, and order documents need one on both sides before
        they are compliant UAE tax invoices — AC-03.{" "}
        <Link href="/admin/settings" className="font-semibold text-navy hover:underline">
          Settings
        </Link>
      </p>
    </>
  );
}
