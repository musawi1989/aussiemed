"use client";

import { useActionState, useState } from "react";
import {
  addPersonAction,
  editPersonAction,
  removePersonAction,
} from "@/app/admin/customers/terms-actions";
import {
  Panel,
  RestoringForm,
  useRestored,
  type FormState,
} from "@/components/AdminForm";
import { ConfirmSubmit } from "./ConfirmSubmit";

export type PersonRow = {
  id: string;
  name: string;
  addressId: string | null;
  branchLabel: string | null;
};

const INPUT =
  "mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none";
const LABEL =
  "block text-xs font-bold uppercase tracking-wide text-text-subtle";

/**
 * The people who place orders for this account.
 *
 * EVERY PERSON BELONGS TO A BRANCH. A practice with three sites needs to know
 * which of them a person orders for, and that is the question every report by
 * branch depends on. Somebody added before the field existed may have none,
 * which shows as a gap rather than being quietly assigned to the first branch
 * on the list.
 *
 * Removing deactivates rather than deletes, and correcting a name does not
 * rewrite orders already placed — each order snapshots the name of whoever
 * placed it, exactly so a correction here cannot rewrite history.
 */
export function AccountPeople({
  id,
  people,
  branches,
}: {
  id: string;
  people: PersonRow[];
  branches: { id: string; label: string }[];
}) {
  const [addState, add, adding] = useActionState<FormState, FormData>(
    addPersonAction,
    null,
  );
  const [editState, edit, editing] = useActionState<FormState, FormData>(
    editPersonAction,
    null,
  );
  const [removeState, remove, removing] = useActionState<FormState, FormData>(
    removePersonAction,
    null,
  );

  const [openId, setOpenId] = useState<string | null>(null);

  // Both remember what was chosen or typed when the form is refused: being
  // told to choose a branch should not also discard the name.
  const NameField = ({ defaultValue }: { defaultValue?: string }) => {
    const restored = useRestored("name");
    return (
      <label className="block">
        <span className={LABEL}>Name</span>
        <input
          name="name"
          defaultValue={restored ?? defaultValue ?? ""}
          placeholder="Dr Reem Haddad"
          className={INPUT}
        />
      </label>
    );
  };

  const BranchSelect = ({ defaultValue }: { defaultValue?: string | null }) => {
    const restored = useRestored("addressId");
    return (
      <label className="block">
        <span className={LABEL}>Orders for</span>
        <select
          name="addressId"
          defaultValue={restored ?? defaultValue ?? ""}
          className={INPUT}
        >
          {/* An empty first option, so adding somebody is a deliberate choice
              of branch rather than whichever happened to be first. */}
          <option value="">Choose a branch…</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.label}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <Panel
      title={`Who orders (${people.length})`}
      note="The names that appear in the picker at checkout. Removing somebody keeps the orders they placed."
    >
      {branches.length === 0 ? (
        <p className="rounded-card bg-attention-soft px-3 py-3 text-sm text-attention-text">
          Add a branch first. Everybody who orders belongs to one, so there is
          nothing to attach a person to yet.
        </p>
      ) : (
        <>
          {people.length === 0 ? (
            <p className="rounded-card bg-surface-sunken px-3 py-3 text-sm text-text-muted">
              Nobody yet. Orders can still be placed &mdash; the picker is
              optional &mdash; but naming who ordered is what makes a report by
              person possible later.
            </p>
          ) : (
            <ul className="space-y-2">
              {people.map((person) => (
                <li
                  key={person.id}
                  className="rounded-card border border-border-base bg-surface-sunken px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-text">
                        {person.name}
                      </span>
                      <span className="block text-xs text-text-muted">
                        {person.branchLabel ?? (
                          /* Not hidden and not guessed. A person with no
                             branch predates the field, and inventing one
                             would corrupt every report by site. */
                          <span className="font-semibold text-attention-text">
                            No branch set
                          </span>
                        )}
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setOpenId(openId === person.id ? null : person.id)
                      }
                      className="shrink-0 cursor-pointer rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text transition-colors hover:border-navy hover:text-navy"
                    >
                      {openId === person.id ? "Close" : "Edit"}
                    </button>

                    <RestoringForm state={removeState} saveAll={false} action={remove} className="shrink-0">
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="personId" value={person.id} />
                      <ConfirmSubmit
                        what={person.name}
                        consequence="They can no longer order for this account. Orders they have already placed are unaffected."
                        pending={removing}
                        pendingLabel="Removing…"
                        className="cursor-pointer rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:border-danger disabled:opacity-60"
                      />
                    </RestoringForm>
                  </div>

                  {openId === person.id && (
                    <RestoringForm
                      action={edit}
                      state={editState}
                      className="mt-3 border-t border-border-base pt-3"
                    >
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="personId" value={person.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <NameField defaultValue={person.name} />
                        <BranchSelect defaultValue={person.addressId} />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button
                          type="submit"
                          disabled={editing}
                          className="cursor-pointer rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
                        >
                          {editing ? "Saving…" : "Save person"}
                        </button>
                        {editState?.ok === false && editState.error && (
                          <span
                            role="alert"
                            className="text-xs font-semibold text-danger"
                          >
                            {editState.error}
                          </span>
                        )}
                        {editState?.ok === true && editState.message && (
                          <span
                            role="status"
                            className="text-xs font-semibold text-success"
                          >
                            {editState.message}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-text-subtle">
                        Correcting a name does not change the orders they have
                        already placed &mdash; each one records the name as it
                        was at the time.
                      </p>
                    </RestoringForm>
                  )}
                </li>
              ))}
            </ul>
          )}

          {removeState?.ok === false && removeState.error && (
            <p role="alert" className="mt-2 text-xs font-semibold text-danger">
              {removeState.error}
            </p>
          )}

          <RestoringForm
            action={add}
            state={addState}
            className="mt-4 border-t border-border-base pt-4"
          >
            <input type="hidden" name="id" value={id} />
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <NameField />
              <BranchSelect />
              <button
                type="submit"
                disabled={adding}
                className="cursor-pointer rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
              >
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
            {addState?.ok === false && addState.error && (
              <p
                role="alert"
                className="mt-2 text-xs font-semibold text-danger"
              >
                {addState.error}
              </p>
            )}
            {addState?.ok === true && addState.message && (
              <p
                role="status"
                className="mt-2 text-xs font-semibold text-success"
              >
                {addState.message}
              </p>
            )}
          </RestoringForm>
        </>
      )}
    </Panel>
  );
}
