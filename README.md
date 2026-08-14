# AussieMed

B2B storefront for medical, dental, laboratory and cleaning supplies, priced in
AED for trade buyers in the UAE.

This is a **fresh build**, not a port. The previous ASP.NET site was extracted
for its data and business rules only; its markup, theme and behaviour were
deliberately discarded.

**Status: local development. Not deployed anywhere.** `robots: noindex` is set
site-wide and stays until launch.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run data:build` | Regenerates `src/data/catalog.json` from `extraction/data` |
| `npm run check` | 15 data-integrity assertions on the catalogue |
| `npm test` | 48 unit tests (Node's built-in runner, no test dependencies) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run register` | Validates the issue register and regenerates the spreadsheet |
| `npm run verify` | data:build → check → register → test → typecheck |
| `npm run smoke` | 26 API contract checks (needs a server running) |

## Things that need attention

Every assumption, stand-in and stubbed flow is tracked in one place, with an
owner and a priority.

- **`docs/Things That Need Attention.xlsx`** — open this. Summary tab, then
  Needs attention / Deferred / Done, filterable, P1 highlighted in red.
- `docs/ISSUE-REGISTER.md` — the same list as readable Markdown.
- `docs/issue-register.csv` — **the source of truth. Edit this one.**

The `.xlsx` and `.md` are generated, so edits to them are overwritten. Change
the CSV and run `npm run register`. Validation runs inside `npm run verify`,
because an unquoted comma silently shifts every column after it — which is the
defect that broke the old platform's bulk upload.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4. No database yet —
the catalogue is a generated JSON file behind a data-access seam.

## Layout

```
src/
  app/            Routes. /api/v1/* is the contract the backend must honour.
  components/     UI.
  lib/
    query.ts      Pure catalogue querying — no data source, fully unit-tested.
    catalog.ts    Binds query.ts to the JSON. THE SEAM: swap this for the DB.
    money.ts      All currency, VAT and tier-pricing rules. Unit-tested.
    store.tsx     Cart, quote cart, wishlist, demo session (localStorage).
    demo-account.ts  Fabricated order history for the account screens.
  data/
    catalog.json  GENERATED — edit scripts/build-catalog.mjs, not this.
scripts/          Catalogue generator, data checks, API smoke tests.
extraction/       Read-only mirror of the old site. Reference only.
```

## Rules the old platform broke

These are enforced by tests, not convention:

- Currency is always the English string `AED`, never a localised symbol. The
  characters `د.إ` must appear nowhere. Money is always 2 decimals.
- Quantities are always integers. Never `3.00`.
- Volume tiers ascend by quantity and descend in price.
- A category's advertised count always equals what clicking it returns.
- Category slugs are unique across the whole tree, so no two categories can
  collide and make one unreachable.
- An order spanning N suppliers produces exactly N invoices under one
  reference number, and per-invoice VAT sums to the order VAT without drift.
- Customer-facing wording says **reference number**, never "order number".
- Every page and product has a unique title and meta description.

## What is real and what is not

**Real** — 11 products, 146 categories, and the tier-pricing model, all derived
from the extraction.

**Invented** — 50 placeholder products (flagged `isPlaceholder` and badged in
the UI), all supplier names, the demo customer and their three orders, and the
copy on About / Contact / Order Support.

**Deliberately empty** — Terms and Privacy. Legal wording must come from the
business; nothing was invented.

**Stubs that submit nothing** and say so on screen: checkout, quote request,
bulk-buy enquiry, Notify Me, and the demo sign-in. Real versions need the
backend.

## Data repairs applied during extraction

The source data was in poor shape. `scripts/build-catalog.mjs` documents every
transformation. The significant ones:

- **No product ever linked to a category.** All 11 were mapped by hand.
- **No usable images.** `listImage` was `null` or a social-media icon;
  `pdpImages` led with a scraped JavaScript fragment. All discarded.
- **The one real photo set was wrong** — the scrub top's primary image is a
  stock pocket watch. Excluded; the file remains in `public/products/`.
- **Supplier 21's volume tiers are entered backwards**, with thresholds
  descending and tier 1 repeating the base price. Supplier 20's product 183
  (`[1,5,10] → [100,95,90]`) shows the intended shape. Malformed rows are
  normalised rather than reproduced. **This needs confirming with the client.**
- HTML entities (`&amp;`) decoded out of product names.

## Open questions

1. **Are the volume price breaks correct?** The source data was malformed and
   repaired on an assumption. Highest-priority answer needed.
2. **Confirm the contact address.** `info@aussiemed.com` is used throughout;
   the old site had the misspelled `assuiemed.com`.
3. When does the real catalogue arrive, to replace the placeholders?
4. Terms and Privacy wording.

## Deferred until the end, by agreement

Payment gateway (v1 is offline / purchase order only), Google and Facebook
OAuth, SMTP provider and sending domain, hosting and database target.

## Next phase

The backend, per `extraction/BACKEND_SPEC.md`: Express + Prisma, roles, email
OTP, per-supplier invoicing, supplier portal, admin panel, comma-safe `.xlsx`
bulk upload. `/api/v1` already defines the contract it must satisfy.

## Note on the extraction

`extraction/site/assets` contains the previous site's theme, including vendor
libraries and fonts, likely licensed to the former development agency. The
rebuild uses none of it. **Do not publish this repository publicly.**
