"use client";

import { useActionState } from "react";
import {
  addBranchAction,
  addStaffAction,
  removeBranchAction,
  removeStaffAction,
} from "@/app/(shop)/account/actions";
import type { FormState } from "@/components/AdminForm";

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

function RemoveButton({
  action,
  field,
  id,
  confirm,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  field: string;
  id: string;
  confirm: string;
}) {
  const [state, submit, pending] = useActionState(action, null);

  return (
    <form
      action={submit}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name={field} value={id} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-bold text-text-muted transition-colors hover:text-danger disabled:opacity-60"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {state?.ok === false && state.error && (
        <span role="alert" className="text-xs font-semibold text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}

const field =
  "h-10 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text";

export function AddBranchForm() {
  const [state, submit, pending] = useActionState(addBranchAction, null);

  return (
    <form action={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-text">
            Branch name
          </span>
          <input name="label" required placeholder="Jumeirah clinic" className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-text">
            Who takes delivery
          </span>
          <input name="contact" required placeholder="Reception" className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-text">Phone</span>
          <input name="phone" type="tel" className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-text">City</span>
          <input name="city" required placeholder="Dubai" className={field} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-bold text-text">Address</span>
          <input name="line1" required placeholder="Street and building" className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-text">
            Unit or floor
          </span>
          <input name="line2" className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-text">Emirate</span>
          <input name="emirate" placeholder="Dubai" className={field} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-card bg-brand px-5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add branch"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function RemoveBranchButton({ id, name }: { id: string; name: string }) {
  return (
    <RemoveButton
      action={removeBranchAction}
      field="branchId"
      id={id}
      confirm={`Remove ${name}? Orders already delivered there keep it, and you can add it again later.`}
    />
  );
}

export function AddStaffForm() {
  const [state, submit, pending] = useActionState(addStaffAction, null);

  return (
    <form action={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-text">Name</span>
          <input name="name" required placeholder="Dr Reem Haddad" className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-text">
            Email <span className="font-normal text-text-subtle">(optional)</span>
          </span>
          <input name="email" type="email" className={field} />
        </label>
      </div>

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
    <RemoveButton
      action={removeStaffAction}
      field="staffId"
      id={id}
      confirm={`Remove ${name} from the list? Orders they placed keep their name.`}
    />
  );
}
