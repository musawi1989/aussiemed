"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useState } from "react";
import {
  createAdminAction,
  resetPasswordAction,
  setDisabledAction,
  setMasterAction,
  setPermissionsAction,
} from "@/app/admin/team/actions";
import type { FormState } from "@/components/AdminForm";

type Group = {
  heading: string;
  permissions: { key: string; label: string; detail: string }[];
};

type Account = {
  id: string;
  name: string;
  username: string | null;
  email: string;
  isMasterAdmin: boolean;
  isDisabled: boolean;
  denied: string[];
  isYou: boolean;
  createdOn: string;
};

/**
 * The master admin's console.
 *
 * ONE CARD PER PERSON, with their permissions folded away until asked for.
 * The common visit is checking who has an account, not editing one, and a
 * screen that opens as forty checkboxes across five people is a screen nobody
 * reads before clicking.
 *
 * TICKED MEANS ALLOWED, which is the opposite of how it is stored. Denials are
 * what the database holds — see admin-permissions.ts for why that direction —
 * but "tick what they can do" is the sentence a person is thinking, and making
 * them invert it in their head is how the wrong box gets cleared.
 *
 * The rules about the last master admin are enforced on the server, not here.
 * This hides the controls that cannot work so nobody is offered a button that
 * refuses, but the refusal is what actually protects the system.
 */
export function AdminTeam({
  accounts,
  groups,
}: {
  accounts: Account[];
  groups: Group[];
}) {
  const [adding, setAdding] = useState(false);
  const [state, submit, pending] = useActionState(createAdminAction, null);

  const masters = accounts.filter((a) => a.isMasterAdmin && !a.isDisabled).length;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm tnum text-text-muted">
          {accounts.length} admin account{accounts.length === 1 ? "" : "s"} ·{" "}
          {masters} master admin{masters === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-card bg-navy px-3 py-1.5 text-xs font-bold text-on-navy transition-colors hover:bg-navy-hover"
        >
          {adding ? "Cancel" : "Add an admin"}
        </button>
      </div>

      {adding && (
        <RestoringForm state={state} saveAll={false}
          action={submit}
          className="mt-3 rounded-card border border-border-strong bg-surface-sunken p-4"
        >
          <h2 className="text-sm font-bold text-text">A new admin account</h2>
          <p className="mt-1 text-xs text-text-muted">
            They sign in with the username and password you set here. Everything
            is switched on to start with; narrow it afterwards on their card.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field name="name" label="Full name" defaultValue={state?.values?.name} placeholder="Samir Haddad" />
            <Field name="username" label="Username" defaultValue={state?.values?.username} placeholder="samir" />
            <Field name="email" label="Email" type="email" defaultValue={state?.values?.email} placeholder="samir@aussiemed.com" />
            {/* Never echoed back on a refusal, unlike the fields beside it. */}
            <Field name="password" label="Password" type="password" placeholder="At least 8 characters" />
          </div>

          <label className="mt-3 flex items-start gap-2">
            <input type="checkbox" name="isMasterAdmin" className="mt-0.5 h-4 w-4 shrink-0 accent-navy" />
            <span className="text-xs text-text">
              <span className="font-bold">Make them a master admin</span>
              <span className="block text-[11px] text-text-subtle">
                Full control of everything, including this screen and everyone on
                it. Only for somebody who should be able to lock you out.
              </span>
            </span>
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-card bg-navy px-3 py-1.5 text-xs font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
            >
              {pending ? "Creating…" : "Create the account"}
            </button>
            <Feedback state={state} />
          </div>
        </RestoringForm>
      )}

      <ul className="mt-4 space-y-3">
        {accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            groups={groups}
            lastMaster={account.isMasterAdmin && masters <= 1}
          />
        ))}
      </ul>
    </>
  );
}

function AccountCard({
  account,
  groups,
  lastMaster,
}: {
  account: Account;
  groups: Group[];
  lastMaster: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [perms, savePerms, savingPerms] = useActionState(setPermissionsAction, null);
  const [master, saveMaster, savingMaster] = useActionState(setMasterAction, null);
  const [disabled, saveDisabled, savingDisabled] = useActionState(setDisabledAction, null);
  const [pw, savePw, savingPw] = useActionState(resetPasswordAction, null);

  const all = groups.flatMap((g) => g.permissions);
  const offCount = account.denied.length;

  return (
    <li className="rounded-card border border-border-base bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">
            {account.name}
            {account.isMasterAdmin && (
              <span className="ml-2 rounded-full bg-navy-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy">
                master admin
              </span>
            )}
            {account.isYou && (
              <span className="ml-1.5 rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                you
              </span>
            )}
            {account.isDisabled && (
              <span className="ml-1.5 rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">
                disabled
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs tnum text-text-muted">
            {account.username ?? "no username"} · {account.email} · added{" "}
            {account.createdOn}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {account.isMasterAdmin
              ? "Reaches everything. Permissions do not apply to a master admin."
              : offCount === 0
                ? "Reaches every section."
                : `${offCount} section${offCount === 1 ? "" : "s"} switched off.`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text transition-colors hover:bg-surface-hover"
        >
          {open ? "Close" : "Manage"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-4 border-t border-border-base pt-3">
          {/* --- what they can reach --- */}
          {account.isYou ? (
            <p className="rounded-card border-l-4 border-navy-border bg-navy-soft px-3 py-2 text-xs text-text">
              <span className="font-bold">This is your own account.</span> You
              cannot change your own permissions or your own status — another
              master admin has to, which is what stops the last one shutting
              themselves out by accident.
            </p>
          ) : account.isMasterAdmin ? (
            <p className="rounded-card border-l-4 border-navy-border bg-navy-soft px-3 py-2 text-xs text-text">
              A master admin reaches everything by definition. Take mastery away
              below if they should be limited.
            </p>
          ) : (
            <RestoringForm state={perms} saveAll={false} action={savePerms}>
              <input type="hidden" name="userId" value={account.id} />
              <p className="text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                Visibility and actions
              </p>
              <p className="mt-0.5 text-[11px] text-text-subtle">
                Visibility and permission to make changes are separate. A hidden section also blocks its actions.
              </p>

              <div className="mt-2 space-y-3">
                {groups.map((group) => (
                  <div key={group.heading}>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                      {group.heading}
                    </p>
                    <div className="mt-1 space-y-1.5">
                      {group.permissions.map((permission) => (
                        <label key={permission.key} className="flex items-start gap-2">
                          {/* Declares what the form offered, so a permission
                              added between render and submit is not read as a
                              denial nobody made. */}
                          <input type="hidden" name="offered" value={permission.key} />
                          <input
                            type="checkbox"
                            name="allow"
                            value={permission.key}
                            defaultChecked={!account.denied.includes(permission.key)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-navy"
                          />
                          <span className="text-xs text-text">
                            <span className="font-bold">{permission.label}</span>
                            <span className="block text-[11px] text-text-subtle">
                              {permission.detail}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={savingPerms}
                  className="rounded-card bg-navy px-3 py-1.5 text-xs font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
                >
                  {savingPerms ? "Saving…" : "Save permissions"}
                </button>
                <span className="text-[11px] text-text-subtle">
                  {all.length} permissions
                </span>
                <Feedback state={perms} />
              </div>
            </RestoringForm>
          )}

          {/* --- mastery, password, disabling: separate forms, never nested --- */}
          {!account.isYou && (
            <>
              <RestoringForm state={master} saveAll={false} action={saveMaster} onSubmit={event => { if (!confirm(`Change master-admin access for ${account.name}? This changes their control over all accounts and settings.`)) event.preventDefault(); }} className="border-t border-border-base pt-3">
                <input type="hidden" name="userId" value={account.id} />
                {!account.isMasterAdmin && (
                  <input type="hidden" name="makeMaster" value="1" />
                )}
                <button
                  type="submit"
                  disabled={savingMaster || (account.isMasterAdmin && lastMaster)}
                  className="text-xs font-bold text-navy hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  {savingMaster
                    ? "Saving…"
                    : account.isMasterAdmin
                      ? "Take away master admin"
                      : "Make them a master admin"}
                </button>
                <span className="ml-2 text-[11px] text-text-subtle">
                  {account.isMasterAdmin && lastMaster
                    ? "This is the only master admin — make somebody else one first."
                    : account.isMasterAdmin
                      ? "They keep their account and go back to per-section permissions."
                      : "Full control of everything, including this screen."}
                </span>
                <Feedback state={master} />
              </RestoringForm>

              <RestoringForm state={pw} saveAll={false} action={savePw} onSubmit={event => { if (!confirm(`Reset ${account.name}'s password and sign them out?`)) event.preventDefault(); }} className="border-t border-border-base pt-3">
                <input type="hidden" name="userId" value={account.id} />
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                    Set a new password
                  </span>
                  <input
                    name="password"
                    type="password"
                    placeholder="At least 8 characters"
                    className="w-full max-w-xs rounded-card border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-text focus:border-navy focus:outline-none"
                  />
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={savingPw}
                    className="rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text transition-colors hover:bg-surface-hover disabled:opacity-60"
                  >
                    {savingPw ? "Saving…" : "Change the password"}
                  </button>
                  <span className="text-[11px] text-text-subtle">
                    Signs them out everywhere.
                  </span>
                  <Feedback state={pw} />
                </div>
              </RestoringForm>

              <RestoringForm state={disabled} saveAll={false} action={saveDisabled} onSubmit={event => { if (!confirm(`${account.isDisabled ? "Enable" : "Disable"} sign-in for ${account.name}?`)) event.preventDefault(); }} className="border-t border-border-base pt-3">
                <input type="hidden" name="userId" value={account.id} />
                {!account.isDisabled && <input type="hidden" name="disable" value="1" />}
                <button
                  type="submit"
                  disabled={savingDisabled}
                  className={`text-xs font-bold hover:underline disabled:opacity-60 ${
                    account.isDisabled ? "text-navy" : "text-danger"
                  }`}
                >
                  {savingDisabled
                    ? "Saving…"
                    : account.isDisabled
                      ? "Let them sign in again"
                      : "Disable this account"}
                </button>
                <span className="ml-2 text-[11px] text-text-subtle">
                  {/* Disabled, never deleted: their name is on orders, audit
                      entries and documents, and deleting the account would not
                      take it off any of them. */}
                  Accounts are disabled rather than deleted — their name is on
                  work they did.
                </span>
                <Feedback state={disabled} />
              </RestoringForm>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-card border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-text focus:border-navy focus:outline-none"
      />
    </label>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state?.ok === false && state.error) {
    return (
      <p role="alert" className="mt-1 text-xs font-semibold text-danger">
        {state.error}
      </p>
    );
  }
  if (state?.ok === true) {
    return (
      <p role="status" className="mt-1 text-xs font-semibold text-success">
        {state.message ?? "Saved."}
      </p>
    );
  }
  return null;
}
