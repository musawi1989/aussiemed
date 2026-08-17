"use client";

import { useActionState, useState } from "react";
import {
  addBranchAction,
  addStaffAction,
  editBranchAction,
  removeBranchAction,
  removeStaffAction,
  renameAccountAction,
  withdrawChangeAction,
} from "@/app/(shop)/account/actions";
import { REASON_MIN } from "@/lib/account-change-plan";
import type { FormState } from "@/components/AdminForm";
import { CountryFields } from "@/components/CountryFields";

function Feedback({ state }: { state: FormState }) {
  if (state?.ok === false && state.error) {
    return (
      <p role="alert" className="text-sm font-semibold text-danger">
        {state.error}
      </p>
    );
  }
  if (state?.ok === true) {
    return (
      <p role="status" className="text-sm font-semibold text-success">
        {state.message}
      </p>
    );
  }
  return null;
}

const field =
  "h-10 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text";
const area =
  "w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text";

/**
 * The reason box.
 *
 * Every change to an account carries one, and it is the same control
 * everywhere so nobody has to work out that this form wants a note and that
 * one does not. `minLength` gets the browser to say so before a round trip;
 * the server checks again, because a form control is a convenience and not a
 * rule.
 */
function ReasonField({
  label = "Why is this change being made?",
  hint,
  placeholder,
  state,
}: {
  label?: string;
  hint?: string;
  placeholder?: string;
  /** Carries back what was typed when the last attempt was refused. */
  state?: FormState;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-text">{label}</span>
      <textarea
        name="reason"
        required
        minLength={REASON_MIN}
        rows={2}
        defaultValue={state?.values?.reason ?? ""}
        placeholder={placeholder ?? "She has left the practice"}
        className={area}
      />
      <span className="mt-1 block text-xs text-text-subtle">
        {hint ??
          "Kept on your account's change log, so months later it is clear why this happened."}
      </span>
    </label>
  );
}

/**
 * Removing something, with the reason typed rather than a yes/no box.
 *
 * This used to be a window.confirm. A confirm asks "are you sure", which is
 * the question the person has already answered by clicking; it does not ask
 * the question that matters six months later, which is why. Opening a small
 * form in place is also the difference between a native dialog nobody reads
 * and a field somebody has to fill in.
 */
function RemoveWithReason({
  action,
  field: fieldName,
  id,
  title,
  note,
  submitLabel = "Remove",
  reasonPlaceholder,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  field: string;
  id: string;
  title: string;
  note: string;
  submitLabel?: string;
  reasonPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(action, null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-bold text-text-muted transition-colors hover:text-danger"
      >
        Remove
      </button>
    );
  }

  return (
    <form
      action={submit}
      className="w-full max-w-sm rounded-card border border-border-strong bg-surface-sunken p-3"
    >
      <input type="hidden" name={fieldName} value={id} />
      <p className="text-sm font-bold text-text">{title}</p>
      <p className="mt-0.5 text-xs text-text-muted">{note}</p>

      <div className="mt-2">
        <ReasonField
          label="Why?"
          placeholder={reasonPlaceholder}
          hint="Required. Your account keeps a record of who changed what, and why."
          state={state}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-card bg-danger px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Working…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-card border border-border-strong bg-surface px-4 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
        >
          Cancel
        </button>
      </div>

      <div className="mt-2">
        <Feedback state={state} />
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * Branches
 * ------------------------------------------------------------------ */

type BranchValues = {
  label?: string | null;
  contact?: string;
  phone?: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  emirate?: string;
  countryCode?: string | null;
};

/**
 * `state` wins over `values`: after a refusal the fields show what the person
 * typed, not what was on the record before they started editing it.
 */
function BranchFields({
  values,
  state,
}: {
  values?: BranchValues;
  state?: FormState;
}) {
  const back = (key: keyof BranchValues) =>
    state?.values?.[key] ?? values?.[key] ?? "";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-text">
          Branch name
        </span>
        <input
          name="label"
          required
          defaultValue={back("label")}
          placeholder="Jumeirah clinic"
          className={field}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-text">
          Who takes delivery
        </span>
        <input
          name="contact"
          required
          defaultValue={back("contact")}
          placeholder="Reception"
          className={field}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-text">City</span>
        <input
          name="city"
          required
          defaultValue={back("city")}
          placeholder="Dubai"
          className={field}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-sm font-bold text-text">Address</span>
        <input
          name="line1"
          required
          defaultValue={back("line1")}
          placeholder="Street and building"
          className={field}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-text">
          Unit or floor
        </span>
        <input
          name="line2"
          defaultValue={back("line2")}
          className={field}
        />
      </label>
      <CountryFields
        countryCode={back("countryCode") || values?.countryCode}
        subdivision={back("emirate")}
        phone={back("phone")}
        inputClassName={field}
        labelClassName="mb-1 block text-sm font-bold text-text"
        phoneLabel="Phone"
      />
    </div>
  );
}

export function AddBranchForm() {
  const [state, submit, pending] = useActionState(addBranchAction, null);

  return (
    <form action={submit} className="space-y-3">
      <BranchFields state={state} />
      <ReasonField
        label="Why are you adding this branch?"
        placeholder="We have opened a second surgery in Jumeirah"
        hint="A new delivery address is checked by us before anything is sent there."
        state={state}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-card bg-brand px-5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send for approval"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function EditBranchForm({
  id,
  values,
}: {
  id: string;
  values: BranchValues;
}) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(editBranchAction, null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-bold text-navy transition-colors hover:underline"
      >
        Edit
      </button>
    );
  }

  return (
    <form
      action={submit}
      className="mt-3 w-full rounded-card border border-border-strong bg-surface-sunken p-4"
    >
      <input type="hidden" name="branchId" value={id} />
      <p className="mb-3 text-sm font-bold text-text">Edit this branch</p>

      <BranchFields values={values} state={state} />

      <div className="mt-3">
        <ReasonField
          label="Why is this changing?"
          placeholder="The practice has moved to the next building"
          hint="A change of delivery address is checked by us before it takes effect."
          state={state}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-card bg-brand px-5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send for approval"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-10 rounded-card border border-border-strong bg-surface px-4 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
        >
          Cancel
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function RemoveBranchButton({ id, name }: { id: string; name: string }) {
  return (
    <RemoveWithReason
      action={removeBranchAction}
      field="branchId"
      id={id}
      title={`Remove ${name}?`}
      note="Orders already delivered there keep it. We check removals before they take effect, so you can still order to it until then."
      submitLabel="Send for approval"
      reasonPlaceholder="This site has closed"
    />
  );
}

/* ------------------------------------------------------------------ *
 * The account name
 * ------------------------------------------------------------------ */

export function RenameAccountForm({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(renameAccountAction, null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-bold text-navy transition-colors hover:underline"
      >
        Change the account name
      </button>
    );
  }

  return (
    <form action={submit} className="max-w-lg space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-text">
          Account name
        </span>
        <input
          name="name"
          required
          defaultValue={state?.values?.name ?? current}
          className={field}
        />
        <span className="mt-1 block text-xs text-text-subtle">
          This is the name on your tax invoices, so we check it before it
          changes.
        </span>
      </label>

      <ReasonField
        label="Why is the name changing?"
        placeholder="The practice has been renamed following the merger"
        hint="Kept on your change log alongside who asked for it."
        state={state}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-card bg-brand px-5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send for approval"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-10 rounded-card border border-border-strong bg-surface px-4 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
        >
          Cancel
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * Staff
 * ------------------------------------------------------------------ */

export function AddStaffForm() {
  const [state, submit, pending] = useActionState(addStaffAction, null);

  return (
    <form action={submit} className="max-w-sm space-y-3">
      {/* A name is the whole record. Nobody here signs in, so there is nothing
          an email address would be used for. */}
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-text">Name</span>
        <input
          name="name"
          required
          defaultValue={state?.values?.name ?? ""}
          placeholder="Dr Reem Haddad"
          className={field}
        />
      </label>

      <ReasonField
        label="Why are you adding them?"
        placeholder="She has joined as practice manager and will be ordering"
        state={state}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-card bg-brand px-5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add person"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function RemoveStaffButton({ id, name }: { id: string; name: string }) {
  return (
    <RemoveWithReason
      action={removeStaffAction}
      field="staffId"
      id={id}
      title={`Remove ${name} from the list?`}
      note="Orders they placed keep their name. This takes effect straight away."
      reasonPlaceholder="She has left the practice"
    />
  );
}

/* ------------------------------------------------------------------ *
 * Withdrawing a request
 * ------------------------------------------------------------------ */

export function WithdrawChangeButton({ id }: { id: string }) {
  const [state, submit, pending] = useActionState(withdrawChangeAction, null);

  return (
    <form action={submit} className="flex items-center gap-2">
      <input type="hidden" name="changeId" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-bold text-text-muted transition-colors hover:text-danger disabled:opacity-60"
      >
        {pending ? "Withdrawing…" : "Withdraw"}
      </button>
      {state?.ok === false && state.error && (
        <span role="alert" className="text-xs font-semibold text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}
