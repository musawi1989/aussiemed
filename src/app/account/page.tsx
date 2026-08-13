import type { Metadata } from "next";
import Link from "next/link";
import { AccountGate } from "@/components/AccountGate";
import { ReorderList } from "@/components/ReorderList";
import { SignOutButton } from "@/components/SignOutButton";
import {
  DEMO_CUSTOMER,
  formatOrderDate,
  getDemoOrders,
  getReorderList,
} from "@/lib/demo-account";
import { formatAED } from "@/lib/money";

export const metadata: Metadata = {
  title: "Your Account",
  description:
    "Reorder what you bought last time in a couple of taps, and review your recent AussieMed orders, reference numbers and invoices.",
};

export default function AccountPage() {
  const reorder = getReorderList();
  const orders = getDemoOrders();
  const recent = orders.slice(0, 3);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <AccountGate>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-base pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              {DEMO_CUSTOMER.company}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              {DEMO_CUSTOMER.name} &middot; {DEMO_CUSTOMER.email}
            </p>
          </div>
          <SignOutButton />
        </div>

        <p className="mt-4 rounded-card border border-accent-border bg-accent-soft px-4 py-2.5 text-sm leading-relaxed text-accent">
          Demo session. The customer, orders and invoices below are invented so
          the account surfaces can be reviewed before the backend exists.
        </p>

        {/* Reorder-first: this leads the page, ahead of browsing. */}
        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-text">
                Order again
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Everything you&rsquo;ve bought before, at the quantity you last
                used.
              </p>
            </div>
            <Link
              href="/products"
              className="text-sm font-medium text-brand hover:underline"
            >
              Browse the full catalogue
            </Link>
          </div>
          <div className="mt-4">
            <ReorderList entries={reorder} />
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-text">
              Recent orders
            </h2>
            <Link
              href="/account/orders"
              className="text-sm font-medium text-brand hover:underline"
            >
              All orders
            </Link>
          </div>

          <ul className="mt-4 space-y-2">
            {recent.map((order) => (
              <li key={order.reference}>
                <Link
                  href={`/account/orders/${order.reference}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border-base bg-surface p-4 shadow-card transition-colors hover:border-brand-border"
                >
                  <div>
                    <p className="font-medium tnum text-text">
                      {order.reference}
                    </p>
                    <p className="mt-0.5 text-sm text-text-muted tnum">
                      {formatOrderDate(order.placedOn)} &middot;{" "}
                      {order.itemCount} items &middot; {order.invoices.length}{" "}
                      {order.invoices.length === 1 ? "invoice" : "invoices"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">
                      {order.status}
                    </span>
                    <span className="font-semibold tnum text-text">
                      {formatAED(order.totalAED)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </AccountGate>
    </div>
  );
}
