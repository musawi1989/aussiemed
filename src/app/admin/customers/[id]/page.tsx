import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { countryName } from "@/lib/geo";
import { formatAED } from "@/lib/money";
import { formatTrn } from "@/lib/trn";
import { CustomerForm } from "@/components/CustomerForm";
import { TrnDocument } from "@/components/admin/TrnDocument";
import { ACCEPTED_DOCUMENTS, MAX_DOCUMENT_BYTES } from "@/lib/document-file";
import { AccountTerms } from "@/components/admin/AccountTerms";
import { AgreedPrices } from "@/components/admin/AgreedPrices";
import { AccountBranches } from "@/components/admin/AccountBranches";
import { AccountPeople } from "@/components/admin/AccountPeople";
import { agreedPrices } from "@/lib/customer-admin";
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
        select: {
          id: true,
          label: true,
          contact: true,
          phone: true,
          line1: true,
          line2: true,
          city: true,
          emirate: true,
          countryCode: true,
          country: true,
          isDefault: true,
          // Counted because removing a branch takes its people off the list
          // too, and the button should be able to say so before it is pressed.
          _count: { select: { staff: { where: { isActive: true } } } },
        },
      },
      staff: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          addressId: true,
          address: { select: { label: true, city: true } },
        },
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

  // After the notFound, so a bad id does not run a second query to answer it.
  const prices = await agreedPrices(customer.id);

  /* Shaped for the panels: they take plain rows rather than Prisma types, so
     the components stay unaware of the query that fed them. */
  const branchRows = customer.addresses.map((address) => ({
    id: address.id,
    label: address.label,
    contact: address.contact,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    emirate: address.emirate,
    countryCode: address.countryCode,
    country: address.country,
    isDefault: address.isDefault,
    peopleCount: address._count.staff,
  }));

  const branchOptions = branchRows.map((branch) => ({
    id: branch.id,
    label: branch.label ?? branch.city,
  }));

  const peopleRows = customer.staff.map((person) => ({
    id: person.id,
    name: person.name,
    addressId: person.addressId,
    branchLabel: person.address
      ? (person.address.label ?? person.address.city)
      : null,
  }));

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
          {customer.isDisabled && (
            <StatusPill axis="record" status="Disabled" />
          )}
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

          {/* Under the form rather than inside it: a file input in a form of
              text fields means re-choosing the file to correct a phone
              number, and there is nothing to attach a document to until the
              record exists. */}
          <TrnDocument
            kind="customer"
            id={customer.id}
            document={
              customer.trnDocumentName && customer.trnDocumentUploadedAt
                ? {
                    name: customer.trnDocumentName,
                    uploadedAt: customer.trnDocumentUploadedAt,
                  }
                : null
            }
            maxMb={MAX_DOCUMENT_BYTES / 1024 / 1024}
            accepted={ACCEPTED_DOCUMENTS}
          />

          {/* Terms, then what overrides them, then who and where. Money first
              because it is what somebody opens this screen to change; the
              branches and people below are maintenance. */}
          <div className="mt-6 space-y-6">
            <AccountTerms
              id={customer.id}
              discountBasisPoints={customer.discountBasisPoints}
              paymentTerms={customer.paymentTerms}
            />

            <AgreedPrices
              id={customer.id}
              prices={prices}
              discountBasisPoints={customer.discountBasisPoints}
            />

            <AccountBranches id={customer.id} branches={branchRows} />

            <AccountPeople
              id={customer.id}
              people={peopleRows}
              branches={branchOptions}
            />
          </div>
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

          {/* Branches and Who orders used to be read-only cards here. They
              are editable panels in the main column now, and leaving a second
              copy in the sidebar would be two lists of the same thing, free
              to disagree the moment one of them is filtered differently. */}

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
                      {day(order.placedAt)} · {aed(order.totalFils)} ·{" "}
                      {order.status}
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

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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
