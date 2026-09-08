"use client";

import { useActionState, useState } from "react";
import {
  addBranchAction,
  editBranchAction,
  removeBranchAction,
} from "@/app/admin/customers/terms-actions";
import {
  Panel,
  RestoringForm,
  useRestored,
  type FormState,
} from "@/components/AdminForm";
import { ConfirmSubmit } from "./ConfirmSubmit";

export type BranchRow = {
  id: string;
  label: string | null;
  contact: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  emirate: string;
  countryCode: string;
  country: string;
  isDefault: boolean;
  /** How many people order for it — shown because removing takes them too. */
  peopleCount: number;
};

const INPUT =
  "mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none";
const LABEL =
  "block text-xs font-bold uppercase tracking-wide text-text-subtle";

/**
 * One address field that survives a refusal.
 *
 * What was typed wins over what was stored: after being told the phone number
 * is missing, the person is correcting their own entry, not starting again
 * from the saved record. Without this, one blank field discards the other
 * eight — which is how the product form used to behave, and why useRestored
 * exists at all.
 */
function BranchField({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
}) {
  const restored = useRestored(name);
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <input
        name={name}
        defaultValue={restored ?? defaultValue ?? ""}
        placeholder={placeholder}
        className={INPUT}
      />
    </label>
  );
}

/**
 * The branches an account orders to, editable by an admin.
 *
 * A CUSTOMER ASKS; AN ADMIN DOES. The customer's own version of this screen
 * puts every change into an approval queue, because somebody has to agree to
 * it. An admin is that somebody, so these apply immediately — and still land
 * on the customer's change log, so their timeline is not a half-truth.
 *
 * One row expands into its own form rather than a modal: an address has nine
 * fields, a dialog that size is a page with a border, and a page that scrolls
 * behind a dialog is a page somebody loses their place in.
 */
export function AccountBranches({
  id,
  branches,
}: {
  id: string;
  branches: BranchRow[];
}) {
  const [addState, add, adding] = useActionState<FormState, FormData>(
    addBranchAction,
    null,
  );
  const [editState, edit, editing] = useActionState<FormState, FormData>(
    editBranchAction,
    null,
  );
  const [removeState, remove, removingBranch] = useActionState<
    FormState,
    FormData
  >(removeBranchAction, null);

  // Which row is open, and whether the add form is showing. Nothing is open by
  // default: an account with six branches should read as a list of six, not as
  // six forms.
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const fields = (branch?: BranchRow) => (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <BranchField
          label="Branch name"
          name="label"
          defaultValue={branch?.label}
          placeholder="Jumeirah clinic"
        />
        <BranchField
          label="Who the driver asks for"
          name="contact"
          defaultValue={branch?.contact}
        />
        <BranchField label="Phone" name="phone" defaultValue={branch?.phone} />
        <BranchField label="City" name="city" defaultValue={branch?.city} />
        <BranchField
          label="Address line 1"
          name="line1"
          defaultValue={branch?.line1}
        />
        <BranchField
          label="Address line 2"
          name="line2"
          defaultValue={branch?.line2}
        />
        <BranchField
          label="Emirate or region"
          name="emirate"
          defaultValue={branch?.emirate}
        />
        <BranchField
          label="Country"
          name="country"
          defaultValue={branch?.country ?? "United Arab Emirates"}
        />
      </div>
      {/* Carried rather than asked: the free-text country above is what goes
          on a printed document, and this is what anything grouping or
          filtering reads. Asking for both would invite them to disagree. */}
      <input
        type="hidden"
        name="countryCode"
        value={branch?.countryCode ?? "AE"}
      />
    </>
  );

  return (
    <Panel
      title={`Branches (${branches.length})`}
      note="Where this account's orders are delivered. Removing one archives it — orders already delivered there keep naming it."
    >
      {branches.length === 0 ? (
        <p className="rounded-card bg-surface-sunken px-3 py-3 text-sm text-text-muted">
          No branches yet. An account with nowhere to deliver to cannot check
          out, so add one before they order.
        </p>
      ) : (
        <ul className="space-y-2">
          {branches.map((branch) => (
            <li
              key={branch.id}
              className="rounded-card border border-border-base bg-surface-sunken px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">
                    {branch.label ?? branch.city}
                    {branch.isDefault && (
                      <span className="ml-2 rounded-full bg-navy-soft px-2 py-0.5 text-[11px] font-bold text-navy">
                        default
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-text-muted">
                    {[branch.line1, branch.line2, branch.city, branch.emirate]
                      .filter(Boolean)
                      .join(", ")}{" "}
                    &middot; {branch.contact} &middot; {branch.phone}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setOpenId(openId === branch.id ? null : branch.id)
                  }
                  className="shrink-0 cursor-pointer rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text transition-colors hover:border-navy hover:text-navy"
                >
                  {openId === branch.id ? "Close" : "Edit"}
                </button>

                <RestoringForm state={removeState} saveAll={false} action={remove} className="shrink-0">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="branchId" value={branch.id} />
                  {/* The cascade is the thing worth saying out loud: removing
                      a branch takes everyone who orders for it as well, and
                      the title attribute only says so on hover. */}
                  <ConfirmSubmit
                    what={`the ${branch.label} branch`}
                    consequence={
                      branch.peopleCount > 0
                        ? `${branch.peopleCount} ${branch.peopleCount === 1 ? "person who orders" : "people who order"} for this branch will come off the list too.`
                        : "Nobody currently orders for this branch."
                    }
                    pending={removingBranch}
                    pendingLabel="Removing…"
                    className="cursor-pointer rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:border-danger disabled:opacity-60"
                  />
                </RestoringForm>
              </div>

              {openId === branch.id && (
                <RestoringForm
                  action={edit}
                  state={editState}
                  className="mt-3 border-t border-border-base pt-3"
                >
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="branchId" value={branch.id} />
                  {fields(branch)}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={editing}
                      className="cursor-pointer rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
                    >
                      {editing ? "Saving…" : "Save branch"}
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

      <div className="mt-4 border-t border-border-base pt-4">
        {addOpen ? (
          <RestoringForm action={add} state={addState}>
            <input type="hidden" name="id" value={id} />
            {fields()}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={adding}
                className="cursor-pointer rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
              >
                {adding ? "Adding…" : "Add branch"}
              </button>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="cursor-pointer text-xs font-bold text-text-muted hover:text-navy"
              >
                Cancel
              </button>
              {addState?.ok === false && addState.error && (
                <span
                  role="alert"
                  className="text-xs font-semibold text-danger"
                >
                  {addState.error}
                </span>
              )}
            </div>
          </RestoringForm>
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="cursor-pointer rounded-card border border-border-strong bg-surface px-3 py-1.5 text-sm font-bold text-text transition-colors hover:border-navy hover:text-navy"
          >
            Add a branch
          </button>
        )}
        {addState?.ok === true && addState.message && (
          <p role="status" className="mt-2 text-xs font-semibold text-success">
            {addState.message}
          </p>
        )}
      </div>
    </Panel>
  );
}
