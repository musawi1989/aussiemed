"""
Empties the platform for a fresh populate, keeping only the category tree and
the master admin login.

WHAT SURVIVES, and why only this:
  - Category          the shelves to put things on, kept at the user's request
  - User (admin only) somebody has to be able to sign in and do the populating
  - _prisma_migrations  the schema's own history; deleting it would make the
                        next `prisma migrate deploy` try to re-run everything

Everything else goes: the whole catalogue, every order, purchase order,
shipment, quote, enquiry, email, audit entry, session, setting, courier and
brand. Suppliers and customers go with it — they are created as the platform is
populated.

Foreign keys are switched off for the duration rather than the deletes being
ordered by hand. The order is long, it changes whenever the schema does, and
getting it wrong fails halfway through and leaves a half-emptied database.
Integrity is checked afterwards, which is the part that actually matters.

Run: python scripts/reset-data.py           (asks first)
     python scripts/reset-data.py --yes     (does not)
"""

import sqlite3
import sys

DB = "dev.db"

KEEP_WHOLE = {"Category"}
KEEP_PARTIAL = {"User": 'role = \'Admin\' AND "isMasterAdmin" = 1'}
NEVER_TOUCH = {"_prisma_migrations"}


def tables(conn):
    return [
        r[0]
        for r in conn.execute(
            "select name from sqlite_master where type='table' "
            "and name not like 'sqlite_%'"
        )
    ]


def counts(conn, names):
    return {t: conn.execute(f'select count(*) from "{t}"').fetchone()[0] for t in names}


def main() -> int:
    conn = sqlite3.connect(DB)
    names = [t for t in tables(conn) if t not in NEVER_TOUCH]
    before = counts(conn, names)

    keeping = conn.execute(
        f'select count(*) from "User" where {KEEP_PARTIAL["User"]}'
    ).fetchone()[0]

    if keeping == 0:
        print("REFUSING: no master admin found. Wiping now would leave nobody")
        print("able to sign in. Run `npm run db:seed:accounts` first.")
        return 1

    doomed = sum(n for t, n in before.items() if t not in KEEP_WHOLE and n)
    print(f"About to delete {doomed} rows across {len([t for t in names if t not in KEEP_WHOLE and before[t]])} tables.")
    print(f"Keeping: {before.get('Category', 0)} categories, {keeping} master admin.")

    if "--yes" not in sys.argv:
        if input("Type 'wipe' to continue: ").strip() != "wipe":
            print("Nothing was deleted.")
            return 1

    conn.execute("PRAGMA foreign_keys = OFF")
    with conn:
        for t in names:
            if t in KEEP_WHOLE:
                continue
            if t in KEEP_PARTIAL:
                conn.execute(f'delete from "{t}" where not ({KEEP_PARTIAL[t]})')
            else:
                conn.execute(f'delete from "{t}"')
    conn.execute("PRAGMA foreign_keys = ON")

    # The check that matters: nothing left pointing at something deleted.
    broken = conn.execute("PRAGMA foreign_key_check").fetchall()
    if broken:
        print(f"\nFOREIGN KEY PROBLEMS: {len(broken)}")
        for row in broken[:10]:
            print("  ", row)
        return 1

    integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
    conn.execute("VACUUM")

    after = counts(conn, names)
    print("\nWhat is left:")
    for t in sorted(after):
        if after[t]:
            print(f"  {after[t]:6}  {t}")
    print(f"\nforeign keys: clean · integrity: {integrity}")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
