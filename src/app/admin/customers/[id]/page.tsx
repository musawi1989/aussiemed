import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { countryName } from "@/lib/geo";
import { formatAED } from "@/lib/money";
import { formatTrn } from "@/lib/trn";
import { CustomerForm } from "@/components/CustomerForm";
import { StatusPill } from "@/components/StatusPill";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const aed = (fils: number) => formatAED(fils / 100);

const day = (value: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dubai",
  }).format(value);

/**
 * One customer account — FN-19.
 *
 * The form is the point of the screen, but what sits under it is what tells
 * somebody whether an edit is safe: who signs in, where their branches are,
 * and what they have ordered. An account edited without that context in view
 * is an account edited on a guess.
 */
export default async function AdminCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const customer = await db.organisation.findUnique({
    where: { id },
    include: {
      users: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          approvalStatus: true,
          createdAt: true,
        },
      },
      addresses: {
        where: { isArchived: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, label: true, city: true, emirate: true },
      },
      staff: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
      orders: {
        orderBy: { placedAt: "desc" },
        take: 10,
        select: {
          id: true,
          reference: true,
          status: true,
          totalFils: true,
          placedAt: true,
        },
      },
    },
  });

  if (!customer) notFound();

  const spend = await db.order.aggregate({
    where: { organisationId: id },
    _sum: { totalFils: true },
    _count: true,
  });

  return (
    <>
      <div className="mt-6">
        <Link
          href="/admin/customers"
          className="text-sm font-semibold text-text-muted hover:text-navy"
        >
          ← Customers
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-text">
            {customer.name}
          </h1>
          {customer.isDisabled && <StatusPill axis="record" status="Disabled" />}
          {customer.isSelfRegistered && (
            <span className="rounded-card border border-border-base px-2 py-0.5 text-xs font-semibold text-text-muted">
              Applied online
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-text-muted tnum">
          {spend._count} {spend._count === 1 ? "order" : "orders"} ·{" "}
          {aed(spend._sum.totalFils ?? 0)} · {customer.paymentTerms} ·{" "}
          {formatTrn(customer.trn) ?? "no TRN"} ·{" "}
          {countryName(customer.countryCode) ?? customer.countryCode}
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          <CustomerForm
            customer={{
              id: customer.id,
              name: customer.name,
              trn: customer.trn,
              phone: customer.phone,
              countryCode: customer.countryCode,
              emirate: customer.emirate,
              notes: customer.notes,
              isDisabled: customer.isDisabled,
              paymentTerms: customer.paymentTerms,
            }}
          />
        </div>

        <aside className="space-y-4">
          <Card title={`Who signs in (${customer.users.length})`}>
            {customer.users.length === 0 ? (
              <Empty>
                Nobody yet. An account opened here has no sign-in until somebody
                applies against it or one is created for them.
              </Empty>
            ) : (
              <ul className="space-y-2">
                {customer.users.map((user) => (
                  <li key={user.id} className="text-sm">
                    <span className="font-semibold text-text">{user.name}</span>
                    <span className="block text-xs text-text-muted">
                      {user.email} · {user.approvalStatus}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Branches (${customer.addresses.length})`}>
            {customer.addresses.length === 0 ? (
              <Empty>No delivery addresses yet.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {customer.addresses.map((address) => (
                  <li key={address.id} className="text-sm text-text">
                    {address.label ?? "Unnamed"}
                    <span className="block text-xs text-text-muted">
                      {[address.city, address.emirate].filter(Boolean).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Who orders (${customer.staff.length})`}>
            {customer.staff.length === 0 ? (
              <Empty>Nobody named yet.</Empty>
            ) : (
              <ul className="space-y-1 text-sm text-text">
                {customer.staff.map((person) => (
                  <li key={person.id}>{person.name}</li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent orders">
            {customer.orders.length === 0 ? (
              <Empty>No orders yet.</Empty>
            ) : (
              <ul className="space-y-2">
                {customer.orders.map((order) => (
                  <li key={order.id} className="text-sm">
                    <Link
                      href={`/admin/orders/${order.reference}`}
                      className="font-semibold text-navy hover:underline"
                    >
                      {order.reference}
                    </Link>
                    <span className="block text-xs text-text-muted tnum">
                      {day(order.placedAt)} · {aed(order.totalFils)} · {order.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-panel border border-border-base bg-surface p-4 shadow-card">
      <h2 className="text-xs font-bold uppercase tracking-wide text-text-subtle">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-text-muted">{children}</p>;
}
