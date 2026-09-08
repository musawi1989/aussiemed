# AussieMed website handover - corrected 8 September 2026

Start here. This package contains the current website source, public product images,
locked dependency versions, database schema and migrations, seed scripts and project documentation.
It is a code handover, not a hosted website or an export of the live business database.

## Replacement for the earlier ZIP

Use the ZIP whose name ends in **-FIXED.zip**. The earlier archive omitted
`src/lib/logo-actions.ts`, `src/lib/logo-access.ts` and `src/lib/logo-access.test.ts`.
This caused the supplier portal to fail with "Can't resolve '@/lib/logo-actions'".
The corrected archive includes these files and checks all application source and
database migration files before packaging.

Extract the replacement into a **new folder**, not inside the ZIP viewer. Do not
delete an existing database or overwrite work already done in the old folder.
If the original website is already installed, the separate logo-fix ZIP can be
extracted into the old project folder (the one containing package.json). It adds
only those three source files and a repair note. Stop and restart the development
server afterward; no database reset or dependency reinstall is needed for that patch.

## Run on your computer

1. Install Node.js 22.22 or newer with npm, then extract this ZIP to a normal folder.
2. Open a terminal inside the extracted AussieMed folder (where package.json is).
3. Run these commands, one at a time, stopping if any command fails:

```powershell
node scripts/verify-handover.mjs
Copy-Item .env.example .env
npm ci
node scripts/init-local-db.mjs
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm run db:seed:accounts
npx playwright install chromium
npm run dev
```

On macOS/Linux use `cp .env.example .env` for the first command.
Keep DATABASE_URL="file:./dev.db" for this setup: the supplied catalogue and account
seed scripts use that local SQLite path. Internet access is needed to download dependencies
and Chromium. Keep the terminal running, then open http://localhost:3000.
Admin: http://localhost:3000/admin. Supplier portal: http://localhost:3000/business-portal.
The seed-account script creates demonstration logins and prints their details. These are
sample credentials included in source code, not an export of private account passwords.

The database initialization command creates an empty file only when it is absent;
it never empties an existing database. With the bundled Prisma version, skipping
this step on a new installation can produce a generic "Schema engine error".

## What data will appear

Seeding recreates the bundled sample catalogue and demonstration accounts. Current orders,
customers, supplier allocations, changed catalogue records, settings and uploaded-file
associations from the original database are NOT transferred. Public product image files
are included, but database-only image associations cannot be recreated by the sample seed.
An exact copy of current business records requires a separate authorized database transfer.

## Deliberately excluded

- Actual .env settings, passwords/API credentials and certificate/key files.
- Live SQLite database, database backups, sessions and current customer/order records.
- Private storage, outgoing email/outbox files and uploaded documents (including invoices).
- Uploaded account-logo files, local logs and browser screenshots.
- node_modules, .next, Git history, generated Prisma client and local machine launchers.

Some screens reference uploaded documents from the original database; those documents are
not part of this package. Public placeholders and static site artwork are included.

## Validation and hosting

For code checks run `npm run typecheck` and `npm test` after setup.
For a production build use `npm run build`, then `npm start`.
This package has not been deployed to a public host. The current app uses SQLite plus local
file storage; its host must retain the database and uploads across restarts/deployments.
Configure a public URL and mail settings separately when hosting, and replace demo accounts
and credentials before public use. The localhost address only opens on the machine running it.

The original README and docs are included as project background and contain historical notes.
Use these handover instructions first for installation and for what this archive includes.
FILE-MANIFEST.json lists packaged files and their SHA-256 hashes. Run the extraction
check before installation: Next.js regenerates some local configuration files when
it starts, so later intentional edits can correctly appear as changed files.

Maintainers can rebuild the archive with `python scripts/package-handover.py`.
The packager includes uncommitted source files and matches log files by their actual
extension, so filenames such as `logo-actions.ts` are preserved.
