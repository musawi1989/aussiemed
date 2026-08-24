"use client";

import { useActionState } from "react";
import {
  addCourierAction,
  archiveCourierAction,
  restoreCourierAction,
} from "@/app/admin/settings/actions";
import { AdminForm, Field, Panel, type FormState } from "@/components/AdminForm";

export type CourierItem = {
  id: string;
  name: string;
  isArchived: boolean;
  /** How many orders and purchase orders still name it. */
  usage: number;
};

/**
 * The courier list, as an admin edits it.
 *
 * "Remove" archives rather than deletes, and the screen says so rather than
 * leaving somebody to find out. The name is what an order stores — see the
 * Courier model — so a courier can come off the pickers without changing a
 * word of what last year's delivery notes say. A hard delete would look
 * identical here and would be the one version of this that could not be
 * undone.
 *
 * The usage count sits beside each one because "used by 43 orders" and "used
 * by none" are different decisions, and a screen that shows neither makes them
 * look the same.
 */
export function CourierList({ couriers }: { couriers: CourierItem[] }) {
  const live = couriers.filter((c) => !c.isArchived);
  const archived = couriers.filter((c) => c.isArchived);

  return (
    <Panel
      title="Couriers"
      note="The carriers offered when an order is dispatched, and when a supplier says what is on its way to us."
    >
      {live.length === 0 ? (
        <p className="text-sm text-text-muted">
          No couriers yet. Until one is added, both screens fall back to a
          free-text box &mdash; which is what this list exists to replace.
        </p>
      ) : (
        <ul className="divide-y divide-border-base">
          {live.map((courier) => (
            <Row key={courier.id} courier={courier} archived={false} />
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-border-base pt-4">
        <AdminForm action={addCourierAction} submitLabel="Add courier">
          <Field
            label="Name"
            name="name"
            required
            hint="As it should read on a delivery note — Aramex, Emirates Post, DHL."
          />
        </AdminForm>
      </div>

      {archived.length > 0 && (
        <div className="mt-5 border-t border-border-base pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-text-subtle">
            Removed
          </h3>
          <p className="mt-1 text-xs text-text-subtle">
            Off the pickers. Still named on every order that used them.
          </p>
          <ul className="mt-2 divide-y divide-border-base">
            {archived.map((courier) => (
              <Row key={courier.id} courier={courier} archived />
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function Row({
  courier,
  archived,
}: {
  courier: CourierItem;
  archived: boolean;
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    archived ? restoreCourierAction : archiveCourierAction,
    null
  );

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span
        className={`text-sm font-semibold ${
          archived ? "text-text-subtle line-through" : "text-text"
        }`}
      >
        {courier.name}
      </span>

      <span className="text-xs tnum text-text-subtle">
        {courier.usage === 0
          ? "not used yet"
          : `on ${courier.usage} ${courier.usage === 1 ? "order" : "orders"}`}
      </span>

      <form action={submit} className="ml-auto flex items-center gap-2">
        <input type="hidden" name="id" value={courier.id} />
        <button
          type="submit"
          disabled={pending}
          className={`text-xs font-bold hover:underline disabled:opacity-60 ${
            archived ? "text-navy" : "text-danger"
          }`}
        >
          {pending ? "Saving…" : archived ? "Restore" : "Remove"}
        </button>
      </form>

      {state?.ok === false && state.error && (
        <span role="alert" className="w-full text-xs font-semibold text-danger">
          {state.error}
        </span>
      )}
      {state?.ok === true && state.message && (
        <span role="status" className="w-full text-xs font-semibold text-success">
          {state.message}
        </span>
      )}
    </li>
  );
}
