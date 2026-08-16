"use client";

import { useState } from "react";
import { setCutoffHourAction } from "@/app/admin/settings/actions";
import { AdminForm } from "./AdminForm";
import { formatCutoffHour } from "@/lib/cutoff";

/**
 * When the buying day closes.
 *
 * The preview under the picker is the whole point of the control. This one
 * number is a promise made to every buyer on the storefront and the deadline
 * the warehouse works to, so the person changing it should see the sentence a
 * customer will read before they save, not after.
 */
export function CutoffForm({ hour }: { hour: number }) {
  const [chosen, setChosen] = useState(hour);
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <AdminForm
      action={setCutoffHourAction}
      submitLabel="Save cutoff"
      className="rounded-card border border-border-base bg-surface p-5 shadow-card"
    >
      <h2 className="text-base font-bold tracking-tight text-text">
        Daily order cutoff
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        Orders placed before this each day go on that day&rsquo;s buying run.
        Anything after it waits for the next one.
      </p>

      <label className="mt-4 block max-w-xs">
        <span className="mb-1 block text-sm font-bold text-text">
          Closes at
        </span>
        <select
          name="hour"
          value={chosen}
          onChange={(e) => setChosen(Number(e.target.value))}
          className="h-10 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text"
        >
          {hours.map((h) => (
            <option key={h} value={h}>
              {formatCutoffHour(h)}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-text-subtle">
          Asia/Dubai. The UAE does not observe daylight saving, so this is the
          same hour all year.
        </span>
      </label>

      <div className="mt-4 rounded-card border-l-4 border-navy-border bg-navy-soft px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-navy">
          Every buyer will see
        </p>
        <p className="mt-1 text-sm font-semibold text-text">
          Order before {formatCutoffHour(chosen)} for today&rsquo;s buying run
        </p>
        {chosen !== hour && (
          <p className="mt-1 text-xs text-text-muted">
            Currently {formatCutoffHour(hour)}. Saving moves the deadline
            immediately, including for anyone on the site right now.
          </p>
        )}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-text-subtle">
        Purchase orders already built keep the cutoff they were built against.
        This only decides when the next run closes.
      </p>
    </AdminForm>
  );
}
