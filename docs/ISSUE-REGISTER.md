# AussieMed — things that need attention

Generated from `docs/issue-register.csv`. Edit the CSV, not this file, then run `npm run register`.

**86 items** · 62 outstanding · **22 outstanding P1**

A spreadsheet version is at `docs/Things That Need Attention.xlsx`.

## Accounting

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| AC-01 | Confirm the volume price breaks | Client | P1 | Open | Supplier 21's tiers were entered backwards in the source (thresholds descending, tier 1 repeating the base price). They were normalised on an assumption. Every price on the site depends on it. |
| AC-02 | Confirm the zero-rated VAT classification | Accountant | P1 | Open | 23 of 61 lines are classified zero-rated rather than 5%. Classified by reading product names, which is not good enough for tax. Charging VAT on a zero-rated line misstates a document the customer keeps. |
| AC-03 | Capture the Tax Registration Number (TRN) | Client | P1 | Open | A UAE tax invoice must show the supplier TRN. It is not captured or displayed anywhere. |
| AC-04 | Make order documents compliant tax invoices | Accountant | P1 | Open | The order page is a summary, not a compliant tax invoice. UAE FTA mandates specific fields. |
| AC-05 | Confirm the VAT rate and whether it must be configurable | Accountant | P2 | Open | 5% is hardcoded as a constant. A rate change would need a code change and would break historical orders if applied retroactively. |
| AC-06 | Approve the reference number format | Client | P2 | Open | AM-2026-000318 is invented. Must be server-allocated, unique and sequential; never generated in the browser. |
| AC-07 | Approve the supplier invoice numbering | Accountant | P2 | Open | AM-2026-000318-01 is invented. One invoice per supplier per order. |
| AC-08 | Confirm the rounding policy | Accountant | P3 | Open | Half-up to 2 decimals. Per-line VAT is accumulated then rounded once, so the invoice split and the order total agree to the cent. |
| AC-09 | Decide payment terms and credit accounts | Client | P2 | Open | Trade buyers usually expect credit limits and 30-day terms. Not modelled at all. v1 ships offline / purchase order only. |
| AC-10 | Confirm the default price display | Client | P3 | Open | Prices default to Ex. VAT with a toggle to Inc. VAT. |

## Data

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| DA-01 | Supply the real product catalogue | Client | P1 | Open | 60 of 71 products are seeded from Livingstone and Chemist Warehouse public catalogues for testing. Only 11 are AussieMed products and they carry no categories or images. |
| DA-02 | Verify the product-to-category mapping | Client | P2 | Open | The extraction had no product-category link at all. All 11 real products were mapped by hand from their names. |
| DA-03 | Supply product photography | Client | P1 | Open | AussieMed has almost no imagery of its own: only 2 usable photos in the whole extraction. The 52 images now on the site are the seed suppliers own photographs used for local testing and cannot ship. |
| DA-04 | Wrong image on the scrub top | Client | P3 | Open | The product's primary image was a stock photo of a pocket watch. Excluded from the build; the file is still in public/products/. |
| DA-05 | Approve the product descriptions | Client | P2 | Open | The source had no descriptions. Eleven were written from the product names and need approval before launch. |
| DA-06 | Supply the real supplier list | Client | P1 | Open | Four suppliers exist: two carried over from the extraction with invented names and two test suppliers (Livingstone and Chemist Warehouse) whose catalogues seeded the products. |
| DA-07 | Supply the hero banner image | Client | P2 | Open | The live site loads Content/Banner/July-2026/u1oannrj.png, which the extraction never captured — only Brand, Category, Product and WebHtml folders were mirrored. |
| DA-08 | Obtain Gilroy Regular and Medium | Agency | P2 | Open | The theme references them but the files were never delivered, so the live site already falls back to a generic sans for body text. Gilroy is a commercial typeface. |
| DA-09 | Explain the disappearing product | Client | P3 | Open | Product 180 (Vaseline) was on the storefront listing at 12:45 UTC and gone by 13:05 the same day, while its detail page still loaded. |
| DA-10 | Supply real pack and carton structures | Client | P2 | Open | Outer packs were invented for 15 lines (a box that comes 10 to a carton). Real pack hierarchies are needed. |
| DA-11 | Supply real variant data | Client | P2 | Open | Size and colour axes are invented. Product 183 had variationButtons: 6, so real variant data existed in the old system. |
| DA-12 | Supply real product specifications | Client | P2 | Open | Spec attributes are currently derived generically. Trade buyers check material, standard, sterility and pack size before ordering. |
| DA-13 | Supply safety data sheets and spec sheets | Client | P2 | Open | For laboratory and medical buyers an SDS is frequently a compliance requirement, not a nicety. None were supplied. |
| DA-14 | Confirm the brand list | Client | P3 | Open | Brands were assigned by reading product names. |
| DA-15 | Decide on duplicate categories | Client | P3 | Open | Six category names are duplicated across the tree and two ('Oral Care') are duplicated inside one department. Slugs were disambiguated by appending the ID. |
| DA-16 | Confirm the missing department | Client | P3 | Open | Livingstone has 12 departments; AussieMed has 11 of them. 'Tattoo & Piercing' is absent. |
| DA-17 | Replace the test supplier attribution | Client | P1 | Open | Livingstone and Chemist Warehouse are listed as suppliers for testing only. They are unaffiliated third parties and must not appear on a live storefront. |
| DA-18 | Product ids are derived from slugs | Dev | P2 | Open | Carts and wishlists are stored in the browser against a product id. Ids are now hashed from the slug so they survive a re-seed, which means CHANGING A PRODUCT SLUG ORPHANS ANY SAVED CART LINE referencing it. |

## Legal

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| LG-01 | Supply terms and conditions | Client | P1 | Open | Deliberately left empty. Terms of sale are a legal document and must come from the business. |
| LG-02 | Supply the privacy policy | Client | P1 | Open | Deliberately left empty. A privacy policy must describe what the system actually does with personal data, so it depends on the backend. |
| LG-03 | Confirm the contact email address | Client | P1 | Open | info@aussiemed.com is assumed throughout. The old site used the misspelled assuiemed.com. |
| LG-04 | Approve the About / Contact / Order Support copy | Client | P3 | Open | All placeholder text. |
| LG-05 | Transfer the theme licence | Agency | P2 | Open | The front-end theme was likely purchased under the development agency's account. The extraction also contains their vendor libraries and fonts. |
| LG-06 | Supply company registration details | Client | P2 | Open | Trade licence number, registered address and TRN are needed for the footer and for invoices. |

## Functionality

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| FN-01 | Checkout does not submit an order | Dev | P1 | Open | The form is complete and the flow is reviewable, but nothing is created and no payment is taken. A preview reference number is generated in the browser. |
| FN-02 | Quote requests are not delivered | Dev | P1 | Open | Captured in the browser only. |
| FN-03 | Bulk buy enquiries are not delivered | Dev | P1 | Open | Captured in the browser only. |
| FN-04 | Notify Me does not register a subscription | Dev | P1 | Open | Captured locally. The restock email flow does not exist. |
| FN-05 | Sign-in is a demo flag | Dev | P1 | Open | A localStorage boolean opens a fabricated session. Real auth is email OTP per the backend spec. |
| FN-06 | Account history is fabricated | Dev | P1 | Open | The customer, three orders and their invoices are invented so the account screens could be built and reviewed. |
| FN-07 | Variant switching is not wired | Dev | P2 | Open | Size and colour chips display the current value; other options are disabled because sibling SKUs do not exist yet. |
| FN-08 | Stock is a boolean | Dev | P2 | Open | Products are either in or out of stock. There are no quantities, so no low-stock warnings and no backorder handling. |
| FN-09 | Decide on expiry and short-dated stock | Client | P2 | Open | Medical stock expires. Livingstone sells short-dated lines at a discount. This needs batch and expiry tracking in the schema if wanted. |
| FN-10 | Search is client-side only | Dev | P3 | Open | No synonyms, no typo tolerance, no ranking beyond term matching. |

## Backend

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| BE-01 | Build the backend | Dev | P1 | In progress | Express and Prisma per extraction/BACKEND_SPEC.md: roles, auth, orders, invoices, emails. Eight phases. |
| BE-02 | Build the admin panel | Dev | P1 | Open | Products, categories, suppliers, customers, orders, marketing, reports, settings. |
| BE-03 | Build the supplier portal | Dev | P1 | Open | Suppliers manage their own products but can never self-approve. Must have a failing-then-passing test. |
| BE-04 | Build comma-safe .xlsx bulk upload | Dev | P2 | Open | Parsed natively with exceljs, never by splitting on commas — that is what broke comma-containing category names. |
| BE-05 | Build the email flows | Dev | P2 | Open | OTP verification, order confirmation, restock alerts, supplier notifications to both primary and secondary addresses. |
| BE-06 | Add an audit log | Dev | P2 | Open | Every status transition and every admin or supplier write should be recorded. |
| BE-07 | Seed the database from the catalogue | Dev | P1 | Done | Done. 146 categories, 71 products, 94 SKUs, 173 price tiers and 4 suppliers loaded from src/data/catalog.json. |
| BE-08 | Decide money representation before any data lands | Accountant | P2 | Open | Money is stored as integer fils rather than Decimal, because SQLite has no native decimal type and Prisma falls back to a float there. Confirm this is acceptable to the accountant. |
| BE-09 | Point the storefront at the database | Dev | P1 | Done | Done. Every page and API route reads Prisma. Client components read a snapshot over HTTP because a browser cannot query the database. |
| BE-10 | Retire the catalogue snapshot endpoint | Dev | P2 | Open | Client components fetch the whole catalogue from /api/v1/catalog/snapshot. Fine for 71 products; not for thousands. Goes away when the cart moves server-side. |

## Infrastructure

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| IN-01 | Choose a hosting target | Client | P2 | Open | Nothing is deployed. The site runs locally only. |
| IN-02 | Choose the database | Dev | P2 | Open | SQLite for development with a switch to Postgres. No SQLite-only SQL. |
| IN-03 | Choose an SMTP provider and sending domain | Client | P2 | Open | Required for every transactional email. |
| IN-04 | Decide on a payment gateway | Client | P2 | Open | v1 ships offline / purchase order only. Gateway integration is a pluggable interface. |
| IN-05 | Supply Google and Facebook OAuth keys | Client | P3 | Open | Social login endpoints currently return 501. |
| IN-06 | Remove noindex before launch | Dev | P1 | Open | The site is set to noindex, nofollow site-wide so it cannot be indexed while in development. |
| IN-07 | Confirm the GitHub repository is private | Client | P1 | Open | The repository contains the previous agency's purchased theme, fonts and vendor libraries. |
| IN-08 | Correct the git author name | Client | P3 | Open | Commits are authored as 'AussieMed' because git had no identity configured. |
| IN-09 | Set up continuous integration | Dev | P3 | Open | No CI runs the checks automatically. The spec asks for the currency grep check to run in CI. |
| IN-10 | Plan backups and disaster recovery | Client | P3 | Open | No backup strategy exists for the database or uploaded files. |

## Deferred

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| DF-01 | Industry taxonomy | Dev | P3 | Deferred | A second navigation tree by customer type (Healthcare, Dental, Laboratory, Education, Hospitality, Beauty, First Aid, Facilities) alongside product categories. |
| DF-02 | Subscribe and Save | Dev | P3 | Deferred | Recurring scheduled orders. Pairs naturally with the reorder-first account. |
| DF-03 | Frequently bought together | Dev | P3 | Deferred | Bundle suggestion with a combined total and one action to add all. |
| DF-04 | Quick view | Dev | P3 | Deferred | View a product from the listing without a page load. |
| DF-05 | Downloadable PDF catalogues | Client | P3 | Deferred | Still how a lot of trade buying happens. |

## Done

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| DN-01 | Currency rendering | Dev | P1 | Done | Was rendering the Arabic symbol and 4 decimals. Now always the English string AED with exactly 2 decimals, enforced by test and by a grep check. |
| DN-02 | Integer quantities | Dev | P1 | Done | Quantities were rendering as decimals such as 3.00. |
| DN-03 | Category filtering | Dev | P1 | Done | Every category link redirected to the full product list. Filtering now works, including rolling a department up to everything beneath it. |
| DN-04 | Category counts matching results | Dev | P1 | Done | Admin and storefront counts could diverge. Counts are now derived from the same query that lists the products. |
| DN-05 | Category slug collisions | Dev | P1 | Done | Six categories shared a slug with another category, so one was unreachable and the other answered to the wrong name. |
| DN-06 | Per-supplier invoicing | Dev | P1 | Done | An order spanning N suppliers now produces exactly N invoices under one reference number, with per-invoice VAT summing to the order VAT without drift. |
| DN-07 | Unique page titles and meta descriptions | Dev | P2 | Done | Every page carried the identical title 'Aussie Med \|\| Home' with an empty description. |
| DN-08 | Broken cart images and unresolved asset paths | Dev | P2 | Done | Cart images had a bare domain with no path; templates contained literal '~/' paths. |
| DN-09 | Volume breaks visible while scanning | Dev | P2 | Done | Only a savings badge was shown. The full break table now appears on every product card using +1/+10/+50 notation. |
| DN-10 | Ex VAT / Inc VAT toggle | Dev | P2 | Done | Procurement compares ex-tax and the approver reads inc-tax, so the same buyer needs both during one order. |
| DN-11 | Pack and unit of measure model | Dev | P1 | Done | The same line sells by the box and by the carton at different prices. Cart lines are keyed by product and pack so they never merge. |
| DN-12 | Adopt the existing brand theme | Dev | P2 | Done | Navy #29387d, red #ea2227 and Gilroy, read from the live site's computed styles rather than eyeballed. |
| DN-13 | Catalogue seeded with real products | Dev | P2 | Done | Sixty real items replaced invented placeholders so the storefront can be judged against products that actually exist. |
| DN-14 | Control characters in generated code | Dev | P1 | Done | Shell escaping wrote literal backspace bytes into regex rules, so every packaging and variant rule silently matched nothing while looking correct in every editor. |
| DN-15 | Product images added for testing | Dev | P2 | Done | Fifty-two of 71 products now carry real photography so the layout can be judged with images rather than placeholder tiles. |
| DN-16 | Database schema designed and migrated | Dev | P1 | Done | Thirty tables covering catalogue, packs as SKUs, variants, attributes, documents, batches, orders, per-supplier invoices, quotes, bulk upload and audit. |
| DN-17 | Typecheck was silently passing on a stale cache | Dev | P1 | Done | tsc ran with incremental caching and reported no errors while real type errors existed in the tree. Every earlier typecheck-clean claim was suspect. |
