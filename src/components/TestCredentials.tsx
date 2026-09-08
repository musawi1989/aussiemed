import { db } from "@/lib/db";

/**
 * Test credentials, shown on screen because this runs on a laptop and the
 * accounts are throwaway.
 *
 * READ FROM THE DATABASE, NOT LISTED HERE. It used to be a hardcoded array,
 * and it was wrong within a week: the platform was reset, the accounts it named
 * stopped existing, and the sign-in screen went on confidently offering
 * "supplier1 — Chemist Warehouse" to anybody trying to get in. A list of
 * accounts that is not the list of accounts is worse than no list, because it
 * is believed. This asks who actually exists.
 *
 * MUST NOT SURVIVE A DEPLOYMENT — see SEC-01. It renders nothing outside
 * development, so a production build cannot leak it even if somebody forgets to
 * delete the component. That check is first, before any query runs.
 *
 * The password is the one every seeded account shares. It is not read back
 * because a hash cannot be, and because a password nobody can read is the whole
 * point of storing it that way.
 */

/*
 * One password for every test account, which is what lets this box state it.
 *
 * It was "123456" and one account was changed by hand, so the box then told
 * everybody the wrong thing for that account — the same staleness this
 * component was rewritten to avoid, arriving by a different door. Keeping every
 * test account on one password is what makes a single line here honest; if that
 * ever stops being true, this line has to go and the box has to say less.
 */
const SEEDED_PASSWORD = "AussieMed2026!";

const BLURB: Record<Role, string> = {
  Admin: "Back office",
  Supplier: "Supplier portal",
  Customer: "Buyers",
};

type Role = "Admin" | "Supplier" | "Customer";

export async function TestCredentials({ role }: { role: Role }) {
  if (process.env.NODE_ENV === "production") return null;

  const users = await db.user.findMany({
    where: { role, isDisabled: false },
    orderBy: [{ isMasterAdmin: "desc" }, { createdAt: "asc" }],
    take: 8,
    select: {
      username: true,
      email: true,
      name: true,
      isMasterAdmin: true,
      organisation: { select: { name: true, paymentTerms: true } },
      supplier: { select: { companyName: true } },
    },
  });

  if (users.length === 0) {
    return (
      <div className="mt-6 rounded-card border border-accent-border bg-accent-soft p-4 text-sm leading-relaxed text-accent">
        <p className="font-bold">No {BLURB[role].toLowerCase()} accounts exist yet</p>
        <p className="mt-1">
          {role === "Admin"
            ? "Run npm run db:seed:accounts to create one."
            : "Run npm run db:seed:demo to create the test accounts."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-card border border-accent-border bg-accent-soft p-4 text-sm leading-relaxed text-accent">
      <p className="font-bold">Test accounts — local development only</p>
      <ul className="mt-2 space-y-1">
        {users.map((user) => {
          /* Sign-in takes a username or an email, and staff accounts have
             both. Show whichever is actually typed: a supplier signs in as
             "gulfmed", a buyer as their address. */
          const handle = user.username ?? user.email;

          const note =
            user.supplier?.companyName ??
            (user.organisation
              ? `${user.organisation.name} · ${user.organisation.paymentTerms}`
              : user.name);

          return (
            <li key={handle} className="tnum">
              {handle}
              <span className="opacity-70">
                {" "}
                &mdash; {note}
                {user.isMasterAdmin && " · master admin"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 tnum">
        Password: {SEEDED_PASSWORD}
        <span className="opacity-70"> &mdash; the same for every account above</span>
      </p>
    </div>
  );
}
