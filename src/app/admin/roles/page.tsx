import { db } from "@/lib/db";
import { supplierPermissions } from "@/lib/permissions";
import {
  SUPPLIER_PERMISSIONS,
  ALL_SUPPLIER_PERMISSIONS,
  isChangedFromDefault,
} from "@/lib/permission-catalogue";
import { PermissionRow } from "@/components/admin/PermissionRow";
import { ResetPermissions } from "@/components/admin/ResetPermissions";

/**
 * Roles and permissions.
 *
 * WHAT THIS SCREEN IS FOR: answering "what can a supplier do without us?" in
 * one place. Before it, one of the ten answers was a checkbox on Settings and
 * the other nine were decided in code — which meant the honest answer to the
 * question was "read supply-offers.ts and supplier-portal.ts", and nobody was
 * going to.
 *
 * ONE POLICY FOR THE ROLE, NOT PER SUPPLIER. That is the ask as put, and it is
 * also the safer half to build first: a per-supplier override is a screen where
 * the same question has five answers and the one that applies depends on who is
 * looking. Worth having, and worth having on purpose rather than by accident.
 *
 * EVERY DEFAULT IS WHAT THE CODE ALREADY DID, so this screen changed nothing on
 * the day it arrived. The Changed badge marks anything since moved, and the
 * button at the bottom puts it all back.
 */
export default async function AdminRolesPage() {
  const [modes, pendingOffers, pendingPrices] = await Promise.all([
    supplierPermissions(),
    // The queues these settings create, counted live. A permission set to
    // "needs approval" with nobody watching the queue is a permission set to
    // "no", discovered a fortnight later by a supplier who gave up.
    db.productSupply.count({ where: { isApproved: false } }),
    db.productSupply.count({ where: { proposedCostFils: { not: null } } }),
  ]);

  const changed = ALL_SUPPLIER_PERMISSIONS.filter((definition) =>
    isChangedFromDefault(definition, modes[definition.key])
  ).length;

  const queues: Record<string, { count: number; label: string; href: string }> = {
    addItems: {
      count: pendingOffers,
      label: pendingOffers === 1 ? "addition is waiting." : "additions are waiting.",
      href: "/admin/approvals",
    },
    changePrice: {
      count: pendingPrices,
      label:
        pendingPrices === 1
          ? "price request is waiting."
          : "price requests are waiting.",
      href: "/admin/suppliers/prices",
    },
  };

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">
          Roles and permissions
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          What a supplier can do in their own portal without waiting for you.
          Every choice takes effect immediately, on the server as well as on
          their screen.
        </p>
      </div>

      <section className="mt-5 rounded-card border border-border-base bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-base font-bold tracking-tight text-text">
            Suppliers
          </h2>
          <p className="text-xs text-text-muted">
            {changed === 0
              ? "Everything is as it shipped."
              : `${changed} of ${ALL_SUPPLIER_PERMISSIONS.length} changed from how it shipped.`}
          </p>
        </div>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-text-muted">
          These apply to every supplier account. None of them decides who
          receives a purchase order — that is per item, on{" "}
          <a
            href="/admin/suppliers/cover"
            className="font-semibold underline hover:no-underline"
          >
            Suppliers, Cover
          </a>
          .
        </p>
      </section>

      <div className="mt-5 space-y-5">
        {SUPPLIER_PERMISSIONS.map((group) => (
          <section
            key={group.heading}
            className="rounded-card border border-border-base bg-surface p-5 shadow-card"
          >
            <h2 className="text-base font-bold tracking-tight text-text">
              {group.heading}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-text-muted">
              {group.note}
            </p>

            <div className="mt-4">
              {group.permissions.map((definition) => (
                <PermissionRow
                  key={definition.key}
                  definition={definition}
                  mode={modes[definition.key]}
                  queue={queues[definition.key]}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-5 rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight text-text">
          Starting again
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-text-muted">
          Puts every permission above back to how the system shipped. Nothing
          else is touched — no supplier loses an item, an order or a price.
        </p>
        <div className="mt-4">
          <ResetPermissions changed={changed} />
        </div>
      </section>

      <section className="mt-5 rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight text-text">
          Not here, and why
        </h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-semibold text-text">Per-supplier overrides</dt>
            <dd className="text-xs leading-relaxed text-text-subtle">
              These settings apply to every supplier. Trusting a supplier of ten
              years further than one signed up last week is a fair thing to
              want, and it needs deciding rather than assuming — ask and it can
              be built on top of this.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text">Customer staff permissions</dt>
            <dd className="text-xs leading-relaxed text-text-subtle">
              A trade customer already decides what their own staff can do, on
              their account. That is theirs to set, not ours, so it is not
              gathered in here.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text">Admin roles</dt>
            <dd className="text-xs leading-relaxed text-text-subtle">
              Everybody with an admin account can do everything in it. Splitting
              that into roles is a real piece of work and nobody has said what
              the roles are.
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}
