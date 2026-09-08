"use client";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { saveLogo } from "@/lib/logo-actions";
import { EntityLogo, type LogoKind } from "./EntityLogo";
export function LogoEditor({ kind, id, name }: { kind: LogoKind; id: string; name: string }) {
  const [state, action, pending] = useActionState(saveLogo, null);
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  useEffect(() => { if (state?.ok) { setRevision(value => value + 1); router.refresh(); } }, [state, router]);
  return <form action={action} className="my-4 rounded-card border border-border-base bg-surface p-4">
    <div className="mb-3 flex items-center font-bold"><EntityLogo key={`${id}:${revision}`} kind={kind} id={id} name={name} />{name} logo</div>
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
    <label className="block text-sm">Upload or replace logo (PNG, JPEG or WebP, up to 5 MB)<input className="mt-2 block max-w-full" name="logo" type="file" accept="image/png,image/jpeg,image/webp" /></label>
    <div className="mt-3 flex gap-2"><button disabled={pending} className="rounded-card bg-navy px-4 py-2 text-sm font-bold text-white">{pending ? "Saving…" : "Save logo"}</button><button disabled={pending} name="remove" value="true" className="rounded-card border border-border-strong px-4 py-2 text-sm">Remove logo</button></div>
    {state && <p role={state.ok ? "status" : "alert"} className="mt-2 text-sm">{state.ok ? state.message : state.error}</p>}
  </form>;
}
