import type { Metadata } from "next";
import Link from "next/link";
import { CustomerForm } from "@/components/CustomerForm";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Opening an account on somebody's behalf — FN-19.
 *
 * The sign-up form covers a business that finds us. This covers the ordinary
 * case it does not: a clinic that phones, or one whose account has to exist
 * before the person who will order from it has been decided.
 */
export default function NewCustomerPage() {
  return (
    <>
      <div className="mt-6">
        <Link
          href="/admin/customers"
          className="text-sm font-semibold text-text-muted hover:text-navy"
        >
          ← Customers
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-text">
          Open an account
        </h1>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-text-muted">
          For a business that has asked to trade with us without applying
          online. They will still need a sign-in of their own before they can
          order — this creates the account, not the person.
        </p>
      </div>

      <div className="mt-6 max-w-3xl">
        <CustomerForm />
      </div>
    </>
  );
}
