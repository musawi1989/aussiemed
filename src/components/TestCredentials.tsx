/**
 * Test credentials, shown on screen because this runs on a laptop and the
 * accounts are throwaway.
 *
 * MUST NOT SURVIVE A DEPLOYMENT — see SEC-01. It renders nothing outside
 * development, so a production build cannot leak it even if someone forgets
 * to delete the component.
 */

const ACCOUNTS: Record<string, { handle: string; note: string }[]> = {
  Customer: [{ handle: "musawi1989@gmail.com", note: "buyer" }],
  Supplier: [
    { handle: "supplier1", note: "AussieMed Distribution" },
    { handle: "supplier2", note: "Chemist Warehouse" },
  ],
  Admin: [{ handle: "admin", note: "full access" }],
};

export function TestCredentials({ role }: { role: keyof typeof ACCOUNTS }) {
  if (process.env.NODE_ENV === "production") return null;

  const accounts = ACCOUNTS[role] ?? [];

  return (
    <div className="mt-6 rounded-card border border-accent-border bg-accent-soft p-4 text-sm leading-relaxed text-accent">
      <p className="font-bold">Test account — local development only</p>
      <ul className="mt-2 space-y-0.5">
        {accounts.map((a) => (
          <li key={a.handle} className="tnum">
            {a.handle}{" "}
            <span className="opacity-70">&mdash; {a.note}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 tnum">Password: 123456</p>
    </div>
  );
}
