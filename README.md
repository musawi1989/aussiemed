# AussieMed

B2B storefront for medical, dental, laboratory and cleaning supplies, priced in
AED for trade buyers in the UAE.

A **fresh build**, not a port. The previous ASP.NET site was mined for its data
and business rules; its markup and behaviour were discarded. Its visual brand
was kept — see DEC-01 and DEC-02 in the register.

**Status: local development. Not deployed anywhere.** `robots: noindex` is set
site-wide and stays until launch.

---

## Running it

From a fresh clone, in this order. The first two steps are the ones that were
missing before and that everybody hit: there is no database in the repository
and no `.env`, because neither belongs to source control.

```bash
cp .env.example .env       # Windows: copy .env.example .env
npm install
npx prisma migrate deploy  # creates dev.db from prisma/migrations
npx prisma generate        # the typed client, into src/generated/prisma
npm run db:seed            # catalogue
npm run db:seed:accounts   # sign-in accounts
npm run dev                # http://localhost:3000
```

Optional, and only if you need the PDF downloads (order confirmations and
supplier invoices). Those render a real page in a real browser, so Playwright
needs one — see IN-11:

```bash
npx playwright install chromium
```

Node 22 or newer. The test runner uses `--experimental-strip-types`, which
earlier versions do not have.

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run data:build` | Regenerates `src/data/catalog.json` from the seed files |
| `npm run db:seed` | Loads the catalogue into the database (idempotent) |
| `npm run db:seed:accounts` | Creates the sign-in accounts |
| `npm run db:check` | 28 assertions on the database, including order invariants |
| `npm run check` | 22 data-integrity assertions on the catalogue |
| `npm test` | 75 unit tests (Node's built-in runner, no test dependencies) |
| `npm run typecheck` | `tsc --noEmit --incremental false` |
| `npm run register` | Validates the issue register, regenerates the spreadsheet |
| `npm run verify` | data:build → check → register → test → typecheck |
| `npm run smoke` | 26 API contract checks (needs a server running) |

## Signing in

Three doors, one per role — DEC-09.

| Door | Who | Account |
| --- | --- | --- |
| `/sign-in` | Buyers and clinics | `musawi1989@gmail.com` |
| `/business-portal` | Suppliers | `supplier1`, `supplier2` |
| `/admin` | Staff | `admin` |

Password `123456` for all four. **Test credentials for local use only — SEC-01.**
Signing in at the wrong door names the right one rather than admitting you.

## Things that need attention

Every assumption, stand-in and stubbed flow is tracked in one place, with an
owner and a priority.

- **`docs/Things That Need Attention.xlsx`** — open this. Summary, Needs
  attention, Decisions, Deferred and Done tabs, filterable, P1 in red.
- `docs/ISSUE-REGISTER.md` — the same list as readable Markdown.
- `docs/issue-register.csv` — **the source of truth. Edit this one.**

The **Decisions** tab records what the client actually asked for, separate from
what we assumed, so a reader can tell a requirement from a guess.

The `.xlsx` and `.md` are generated, so edits to them are overwritten. Change
the CSV and run `npm run register`. Validation runs inside `npm run verify`,
because an unquoted comma silently shifts every column after it — the defect
that broke the old platform's bulk upload.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Prisma 7 with
SQLite, Postgres-ready.

## Layout

```
prisma/
  schema.prisma      30 tables. Money is integer fils, never a float.
  seed.ts            Catalogue, from src/data/catalog.json.
  seed-accounts.ts   Sign-in accounts, seeded separately.
src/
  app/               Routes. /api/v1/* is the API contract.
  components/        UI.
  lib/
    query.ts         Pure catalogue querying — no data source, unit-tested.
    catalog.ts       THE SEAM: binds query.ts to the database. Server-only.
    catalog-client.tsx  Client-side catalogue snapshot (a browser cannot
                        query Prisma). Retires in BE-10.
    money.ts         Display currency and VAT rules, in AED. Unit-tested.
    pricing.ts       Server pricing in fils. Anything written to an order
                     goes through here, never through a float.
    orders.ts        Cart and checkout. One transaction, one invoice per
                     supplier.
    auth.ts          scrypt passwords and database-backed sessions.
scripts/             Catalogue generator, data checks, API smoke tests.
extraction/          Read-only mirror of the old site. Reference only.
```

## Rules the old platform broke

Enforced by tests and database constraints, not by convention:

- Currency is always the English string `AED`, never a localised symbol. The
  characters `د.إ` appear nowhere. Money is always 2 decimals.
- Quantities are always integers. Never `3.00`.
- Volume tiers ascend by quantity and descend in price.
- A category's advertised count always equals what clicking it returns.
- Category slugs are unique across the whole tree, so none can shadow another.
- An order spanning N suppliers produces exactly N invoices under one reference
  number — a `UNIQUE(orderId, supplierId)` constraint the database enforces.
- Per-invoice VAT sums to the order VAT with no rounding drift.
- Zero-rated lines carry no VAT.
- Order lines snapshot name, SKU, unit and tax class; the order stores the VAT
  rate in force when placed. History cannot be rewritten by a later edit.
- Customer-facing wording says **reference number**, never "order number".
- Every page and product has a unique title and meta description.

## What is real and what is not

**Real** — the database, the orders, the pricing, the sign-in, the invoice
split. 166 categories: the Livingstone tree from the extraction, completed
against their live site (DA-30). All of it is reachable on the storefront by
the client's decision of 18 Aug 2026 (DEC-27), though only 23 categories hold a
product until the real catalogue is uploaded — the rest say so and take an
enquiry.

**Seeded for testing** — 60 products come from the public catalogues of
Livingstone and Chemist Warehouse (DEC-06), with their photography (DEC-07).
Both are unaffiliated third parties and must not appear on a live storefront —
DA-17. Supplier names and emails are invented — DA-06, DA-19.

**Invented outright** — the other 727 of the 787 products on the site are
sample listings, five per sub-category, so the whole tree can be browsed before
the real catalogue lands (DA-33). They say so on every page and their item codes
start `SAMPLE-`. **Remove them before launch — DA-34, a P1 blocker:**
`npm run db:seed:samples -- --remove`.

**Deliberately empty** — Terms and Privacy. Legal wording must come from the
business; nothing was invented.

**Not built** — payment, OAuth sign-in, and an SMTP provider to send through:
all deferred by agreement until the end (DEC-04). Email itself is built and
every message is recorded; it writes to a local outbox until a provider is
chosen. Quote, bulk-buy and Notify Me all record and appear in the admin
enquiry queue.

## Open questions

1. **Are the volume price breaks correct?** (AC-01) The source data was
   malformed and repaired on an assumption. These now land in stored orders.
2. **Is the zero-rating right?** (AC-02) 25 products are classified VAT-free by
   reading their names. That needs an accountant.
3. **No TRN is captured** (AC-03) and order documents are not yet compliant
   tax invoices (AC-04).
4. Contact address (LG-03), Terms and Privacy wording (LG-01, LG-02).

## Deferred until the end, by agreement

Payment gateway, Google and Facebook OAuth, SMTP provider and sending domain,
hosting and the production database — DEC-04.

## Note on the extraction

`extraction/site/assets` contains the previous site's theme, including vendor
libraries and fonts, likely licensed to the former development agency, and
`public/products/seed` contains third-party product photography. **Keep this
repository private.**