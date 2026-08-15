import { db } from "@/lib/db";
import { VatRateForm } from "@/components/VatRateForm";

/**
 * Settings, deliberately short.
 *
 * Only what is genuinely configurable today appears here. A screen full of
 * controls that do nothing is worse than a screen that admits the gap, so the
 * rest is listed as outstanding with the register item that tracks it.
 */
export default async function AdminSettingsPage() {
  const [vat, currency, version] = await Promise.all([
    db.setting.findUnique({ where: { key: "vatRateBasisPoints" } }),
    db.setting.findUnique({ where: { key: "currency" } }),
    db.setting.findUnique({ where: { key: "catalogVersion" } }),
  ]);

  const percent = Number(vat?.value ?? 500) / 100;

  const outstanding = [
    ["Email templates and sending domain", "IN-03 — no SMTP provider chosen"],
    ["Payment gateway", "IN-04 — not selected"],
    ["Company registration and TRN", "LG-06 and AC-03 — not supplied"],
    ["Reference number format", "AC-06 — ours, unapproved"],
    ["Session lifetime", "BE-16 — 7 days, our choice"],
  ];

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">
          Configuration held as rows, so it changes without a deploy.
        </p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <VatRateForm percent={percent} />

        <div className="space-y-5">
          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              Fixed for now
            </h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">Currency</dt>
                <dd className="font-semibold text-text">
                  {currency?.value ?? "AED"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">Catalogue version</dt>
                <dd className="font-semibold tnum text-text">
                  {version?.value ?? "0"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-text-subtle">
              The catalogue version rises every time the catalogue changes. Each
              server checks it once a second and rebuilds its copy when it
              moves, so an edit here shows on the storefront immediately.
            </p>
          </section>

          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              Not configurable yet
            </h2>
            <p className="mt-1 text-xs text-text-muted">
              Each is waiting on a decision rather than on code.
            </p>
            <ul className="mt-3 space-y-2">
              {outstanding.map(([title, why]) => (
                <li key={title}>
                  <p className="text-sm font-semibold text-text">{title}</p>
                  <p className="text-xs text-text-subtle">{why}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
