# AussieMed — things that need attention

Generated from `docs/issue-register.csv`. Edit the CSV, not this file, then run `npm run register`.

**236 items** · 68 outstanding · **14 outstanding P1**

A spreadsheet version is at `docs/Things That Need Attention.xlsx`.

## Accounting

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| AC-01 | Confirm the volume price breaks | Client | P1 | Open | Supplier 21's tiers were entered backwards in the source (thresholds descending, tier 1 repeating the base price). They were normalised on an assumption. Every price on the site depends on it. |
| AC-02 | Confirm the zero-rated VAT classification | Accountant | P2 | Open | 23 of 61 lines are classified zero-rated rather than 5%. Classified by reading product names, which is not good enough for tax. Charging VAT on a zero-rated line misstates a document the customer keeps. |
| AC-03 | Capture the Tax Registration Number (TRN) | Client | P1 | Open | A UAE tax invoice must show the supplier TRN. It is not captured or displayed anywhere. |
| AC-04 | Make order documents compliant tax invoices | Accountant | P1 | Open | The order page is a summary, not a compliant tax invoice. UAE FTA mandates specific fields. |
| AC-05 | Confirm the VAT rate and whether it must be configurable | Accountant | P2 | Open | 5% is hardcoded as a constant. A rate change would need a code change and would break historical orders if applied retroactively. |
| AC-06 | Approve the reference number format | Client | P2 | Open | AM-2026-000318 is invented. Must be server-allocated, unique and sequential; never generated in the browser. |
| AC-07 | Approve the supplier invoice numbering | Accountant | P2 | Open | AM-2026-000318-01 is invented. One invoice per supplier per order. |
| AC-08 | Confirm the rounding policy | Accountant | P3 | Open | Half-up to 2 decimals. Per-line VAT is accumulated then rounded once, so the invoice split and the order total agree to the cent. |
| AC-09 | Decide payment terms and credit accounts | Client | P2 | Open | Trade buyers usually expect credit limits and 30-day terms. Not modelled at all. v1 ships offline / purchase order only. |
| AC-10 | Confirm the default price display | Client | P3 | Open | Prices are shown Ex. VAT everywhere, and since 15 Aug 2026 there is no way for a buyer to see an inc-VAT figure at all â€” the header toggle was removed at the client's request before VAT was folded into the displayed price. |
| AC-11 | Approve the VAT rounding method on invoices | Accountant | P2 | Open | VAT is rounded per line rather than once per invoice, so the printed lines always add up to the printed total. The alternative rounds once and can leave lines that do not sum. |
| AC-12 | Confirm the reference number sequence resets each year | Accountant | P2 | Open | OUR DECISION: the sequence restarts at 000001 each calendar year, so AM-2026-000001 and AM-2027-000001 can both exist. If accounting needs a single unbroken sequence this must change before real orders. |
| AC-13 | Decide whether an order should reserve stock | Client | P2 | Open | OUR DECISION: checkout does not decrement or reserve anything, because there are no stock levels â€” only an in/out flag. Two customers can order the last unit. |
| AC-14 | Compliance was decided on the customer's TRN alone | Dev | P2 | Done | A document that calls itself a tax invoice without the seller's TRN is not one. The invoice can be emailed to a customer, so this is a document going out under AussieMed's name claiming a status it does not have. |

## Data

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| DA-01 | Supply the real product catalogue | Client | P1 | Open | 60 of 71 products are seeded from Livingstone and Chemist Warehouse public catalogues for testing. Only 11 are AussieMed products and they carry no categories or images. |
| DA-02 | Verify the product-to-category mapping | Client | P2 | Open | The extraction had no product-category link at all, so every mapping on the site is ours. The catalogue is now 71 products across 146 categories and none of that mapping has been checked by anyone who knows the range. |
| DA-03 | Supply product photography | Client | P1 | Open | AussieMed has almost no imagery of its own: only 2 usable photos in the whole extraction. The 52 images now on the site are the seed suppliers own photographs used for local testing and cannot ship. |
| DA-04 | Wrong image on the scrub top | Client | P3 | Done | The product's primary image was a stock photo of a pocket watch. Excluded from the build; the file is still in public/products/. |
| DA-05 | Approve the product descriptions | Client | P2 | Open | The source had no descriptions. All 71 active products now carry text we generated from the product name and supplier listing, and it goes out under AussieMed's name. |
| DA-06 | Supply the real supplier list | Client | P1 | Open | Four suppliers exist: two carried over from the extraction with invented names and two test suppliers (Livingstone and Chemist Warehouse) whose catalogues seeded the products. |
| DA-07 | Supply the hero banner image | Client | P2 | Open | The live site loads Content/Banner/July-2026/u1oannrj.png, which the extraction never captured â€” only Brand, Category, Product and WebHtml folders were mirrored. |
| DA-08 | Obtain Gilroy Regular and Medium | Agency | P2 | Open | The theme references them but the files were never delivered, so the live site already falls back to a generic sans for body text. Gilroy is a commercial typeface. |
| DA-09 | Explain the disappearing product | Client | P3 | Deferred | Product 180 (Vaseline) was on the storefront listing at 12:45 UTC and gone by 13:05 the same day, while its detail page still loaded. |
| DA-10 | Supply real pack and carton structures | Client | P2 | Open | Outer packs were invented for 15 lines (a box that comes 10 to a carton). Real pack hierarchies are needed. |
| DA-11 | Supply real variant data | Client | P2 | Open | Size and colour axes are invented. Product 183 had variationButtons: 6, so real variant data existed in the old system. |
| DA-12 | Supply real product specifications | Client | P2 | Open | Spec attributes are currently derived generically. Trade buyers check material, standard, sterility and pack size before ordering. |
| DA-13 | Supply safety data sheets and spec sheets | Client | P2 | Open | For laboratory and medical buyers an SDS is frequently a compliance requirement, not a nicety. None were supplied. |
| DA-14 | Confirm the brand list | Client | P3 | Open | Brands were assigned by reading product names, because neither source listed a brand field. Bad extractions were caught by hand (Goat, Hello, Roger) but the list has never been checked against reality. |
| DA-15 | Decide on duplicate categories | Client | P3 | Open | Six category names are duplicated across the tree and two ('Oral Care') are duplicated inside one department. Slugs were disambiguated by appending the ID. |
| DA-16 | Confirm the missing department | Client | P3 | Open | Livingstone has 12 departments; AussieMed has 11 of them. 'Tattoo & Piercing' is absent. |
| DA-17 | Replace the test supplier attribution | Client | P1 | Open | Livingstone and Chemist Warehouse are listed as suppliers for testing only. They are unaffiliated third parties and must not appear on a live storefront. |
| DA-18 | Product ids are derived from slugs | Dev | P2 | Open | Carts and wishlists are stored in the browser against a product id. Ids are now hashed from the slug so they survive a re-seed, which means CHANGING A PRODUCT SLUG ORPHANS ANY SAVED CART LINE referencing it. |
| DA-19 | Supplier email addresses are invented | Client | P2 | Open | The seed writes orders@<supplier>.example and accounts@<supplier>.example because secondaryEmail is mandatory. No supplier will receive anything at these addresses. |
| DA-20 | Supply the real packaging quantities | Client | P1 | Open | OUR INVENTED VALUES: how many units make a carton, and how many cartons make a box, are guessed per product family (12 and 4 by default, 10 and 5 for gloves, 20 and 5 for masks). The break discounts of 4% and 8% are also invented. |
| DA-21 | Verify the automatic variant grouping | Client | P2 | Open | Products are grouped into families by stripping sizes and volumes from their names. It found 2 families in the seeded catalogue. A real catalogue will group differently and some groupings will be wrong. |
| DA-22 | Supplier 1 is named AussieMed Distribution rather than a real trading name | Client | P3 | Done | The supplier1 login and its company record are named after the storefront itself, so a supplier signing in sees the AussieMed name in the header where their own company should be. The other seeded supplier is correctly Chemist Warehouse. |
| DA-23 | Two suppliers were asked for; four exist | Client | P2 | Done | The brief was Chemist Warehouse and Livingstone for testing, with the products that made no sense removed. Northline Uniforms and AussieMed Distribution survived that clean-up and still own 11 of the 71 products between them, so a third of the supplier list and a seventh of the catalogue is left over from the old extraction. |
| DA-24 | 13 of 60 products have no image | Client | P2 | Open | Those products render as a monogram tile rather than a photograph. It is a deliberate stand-in and reads acceptably in a grid, but on a trade catalogue an image is often how a buyer confirms they have the right item. |
| DA-25 | Four product images were SVG placeholders saved as .jpg | Dev | P3 | Done | Next's image optimiser rejected them with a 400, so those four products showed a broken image â€” visibly worse than the products with no image at all, which fall back to a monogram tile. The existing check only asked whether the file existed, and it did. |
| DA-26 | Test orders only ever exercised one state | Dev | P3 | Done | A colour system, a report or an alert cannot be checked against data that only shows one colour. Local data that is uniformly healthy hides every defect in the handling of the unhealthy cases. |
| DA-28 | Placeholder TRNs so the tax-invoice path can be tested | Dev | P3 | Done | Without a TRN on either side, every invoice took the unregistered branch and half the tax-invoice code was never exercised. Testing it required inventing numbers, and invented tax numbers are dangerous if they can pass for real. |
| DA-29 | Country stored as a code as well as a name | Dev | P3 | Done | Grouping or filtering by a display name means UAE, U.A.E. and United Arab Emirates are three places. Printing a code means a delivery note that reads AE. |
| DA-30 | Category tree completed against Livingstone | Dev | P3 | Done | A category that does not exist is a shelf nothing can be put on. The client asked for their reference catalogue's taxonomy to be covered in full so every product they intend to sell has somewhere to go. |
| DA-27 | db:check measured categories against the frozen import | Dev | P3 | Done | A check that goes red when somebody makes a legitimate edit is a check people learn to ignore, and then it stops catching the things it was written for. |
| DA-31 | supplyStatus was defaulted over existing availability | Dev | P3 | Done | A supplier who had said they could not supply an item had that silently reversed on the new field, while the old one still said otherwise. |
| DA-32 | The order seed crashed once a test order had shipped | Dev | P3 | Done | A re-seed that works only until the data gets interesting is not much of a re-seed, and the failure was a wall of Prisma internals rather than a reason. |
| DA-33 | Every sub-category filled with sample products | Dev | P2 | Done | The client asked on 18 Aug 2026 for at least five products in every sub-category, so the whole tree can be browsed and tested before the real catalogue lands. There is no real range to fill it with yet (DA-01), so the filler is invented. |
| DA-34 | Remove the sample products before launch | Dev | P1 | Open | 727 invented products are on the storefront. They are labelled as samples on every page, but a live site that lists them is a site advertising stock that does not exist, and a buyer can put one in a basket today. |
| DA-35 | The duplicate Oral Care shelf was merged | Dev | P2 | Done | Beauty, Skin & Personal Care carried two categories both called Oral Care. It came in with the import and was invisible while one of them was empty; making the whole tree visible (DEC-27) and then filling it (DA-33) put the same shelf name twice in one department with different contents behind each. |
| DA-36 | npm run db:seed had been broken since 16 August | Dev | P2 | Done | The seed threw on its first product because it still wrote ProductMaster.supplierId, a column BE-40 removed. Nobody noticed for two days because nobody re-seeded — and when somebody finally did, it had already deleted every product-category link before it crashed, leaving all 60 real products uncategorised. |
| DA-37 | The seed re-created categories that had been deleted | Dev | P2 | Done | Every category an admin removed came back on the next re-seed, because the seed upserted the whole tree from catalog.json on every run. It re-created Piercing Supplies under Beauty on 18 Aug — a shelf that had been moved to Tattoo & Piercing, where a buyer would actually look for it, with the empty original removed on purpose. |
| DA-38 | The client's clinical category list was added | Dev | P2 | Done | The client supplied a surgical and ward-supply taxonomy — eighteen names covering theatre textiles, procedure packs, vascular access and nursing supplies — and asked for anything missing to be added as a department or a sub-category. |
| DA-39 | Henry Schein's taxonomy added, dental made comprehensive | Dev | P2 | Done | The client asked for every category on henryschein.com.au, with the dental listings made comprehensive. Their tree is dental-first and three levels deep; ours is two, asserted by db:check and assumed by the breadcrumb, the Browse menu and the filter sidebar. |
| DA-40 | SQLite's query-parameter limit broke every storefront page | Dev | P2 | Done | At 2,057 active products the catalogue load exceeded the number of parameters SQLite accepts in one query, and every page of the storefront answered 500 with Prisma P2029. It appeared the moment the dental tree was filled and nothing smaller would have shown it. |
| DA-41 | The whole dental tree sits under one Dental department | Dev | P2 | Done | Promoting Henry Schein's top level to departments (DA-39) put twenty-four dental tiles on the front page beside Kitchen and Pet Care. The client asked for them grouped under one Dental category, detailed list and all. |
| DA-42 | Categories were left answering to an awkward URL | Dev | P2 | Done | A slug is disambiguated with a numeric suffix when its plain form is taken, which was true when the dental disciplines were created and stopped being true when the old Dental shelves were absorbed an hour later. Endodontics answered to /products?category=endodontics-2 while the obvious address showed the not-stocked-yet page. |
| DA-43 | What each trade buys is our guess, not the client's | Client | P2 | Open | The eighteen business types are the client's. The departments each one shops in were mapped by reasoning about the trade, because nothing in the catalogue says which business a product suits — there is no attribute, and 1,997 of the 2,057 products are invented samples anyway. |

## Legal

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| LG-01 | Supply terms and conditions | Client | P1 | Open | Deliberately left empty. Terms of sale are a legal document and must come from the business. |
| LG-02 | Supply the privacy policy | Client | P1 | Open | Deliberately left empty. A privacy policy must describe what the system actually does with personal data, so it depends on the backend. |
| LG-03 | Confirm the contact email address | Client | P1 | Done | info@aussiemed.com is assumed throughout. The old site used the misspelled assuiemed.com. |
| LG-04 | Approve the About / Contact / Order Support copy | Client | P3 | Open | All placeholder text. |
| LG-05 | Transfer the theme licence | Agency | P2 | Open | The front-end theme was likely purchased under the development agency's account. The extraction also contains their vendor libraries and fonts. |
| LG-06 | Supply company registration details | Client | P2 | Open | Trade licence number, registered address and TRN are needed for the footer and for invoices. |

## Functionality

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| FN-01 | Checkout does not submit an order | Dev | P1 | Done | Done. Checkout writes a real order in one transaction, with one invoice per supplier and a server-allocated reference number. |
| FN-02 | Quote requests are not delivered | Dev | P1 | Done | The form submitted and the request reached nobody. A quote request is one of the highest-intent things a visitor can do on a trade site, and every one of them was discarded on arrival. |
| FN-03 | Bulk buy enquiries are not delivered | Dev | P1 | Done | Same as FN-02 and arguably worse: a clinic asking for a price on volume is the most valuable enquiry the site can receive, and it went nowhere. |
| FN-04 | Notify Me does not register a subscription | Dev | P1 | Done | The worst of the three. It set a flag in the browser and told the customer "we will email you when it is back in stock" — a promise the system could not keep, because nothing was recorded anywhere. |
| FN-07 | Size and colour switching is not wired | Dev | P2 | Open | The variant dropdown built on 15 Aug 2026 (DEC-12) switches between sibling products by size or volume, and that works. The separate Size and Colour chips on gloves and the scrub top are a different thing and still do nothing â€” no sibling SKU exists behind any of them. |
| FN-08 | Stock is a boolean | Dev | P2 | Done | Products are either in or out of stock. There are no quantities, so no low-stock warnings and no backorder handling. |
| FN-09 | Decide on expiry and short-dated stock | Client | P2 | Open | Medical stock expires. Livingstone sells short-dated lines at a discount. This needs batch and expiry tracking in the schema if wanted. |
| FN-10 | Search is client-side only | Dev | P3 | Open | No synonyms, no typo tolerance, no ranking beyond term matching. |
| FE-30 | Prices are still labelled Ex. VAT with no way to see inc-VAT | Dev | P2 | Done | The header toggle was removed before VAT was folded into the displayed price, so a buyer approving an invoice has no inc-VAT figure anywhere on the storefront. Checkout still adds VAT, so the total at the end is higher than every price shown. |
| FN-11 | Most categories are empty, and three departments are entirely empty | Dev | P2 | Done | 112 of the 135 leaf categories contain no products, and Kitchen, Office & Stationery Supplies and Pet Care contain nothing anywhere beneath them. Every one of those is reachable from Browse All Category, so a buyer can click a department on the front page and land on an empty result. |
| FN-12 | Nothing shows which clients are overdue to reorder | Dev | P2 | Open | In a reorder-first business this is the single most useful signal there is: a clinic that buys gloves every three weeks and has not ordered in five needs a phone call. It is computable from order history alone once there are three orders per client — no new data capture required. |
| FN-13 | The client account has no Buy Again | Dev | P2 | Done | A returning buyer has to search for products they have already bought. For a reorder-first marketplace this is the shortest path between the platform and revenue, and it needs no metrics work at all — just their own order history, sorted by how often they buy each line. |
| FN-14 | The account had no way to repeat an order | Dev | P2 | Done | Reordering was a grid of every item ever bought, one tile each, which duplicated the order history and became unreadable as soon as anyone had ordered more than a few things. "The same as last time" means an order, not a pile of items. |
| FN-15 | The account showed no account figures | Dev | P2 | Done | A trade buyer could see a list of orders but nothing about their own account: how much they spend, how often they order, whether they are overdue. |
| FN-16 | Orders did not say who placed them or which site they were for | Dev | P2 | Done | A practice with several sites and several people ordering had one undifferentiated history, so "who ordered this and where did it go" could not be answered. |
| FN-17 | Saved products were an undifferentiated list | Dev | P2 | Done | A buyer who has saved forty things needs them grouped to find anything. |
| FN-18 | A customer could see their orders but never their spending | Dev | P2 | Done | The account showed a list of orders and a few headline figures on the overview, and nothing else. There was no way to ask what a practice had spent over a quarter, where it went, who was ordering it, or to get the invoices out in a form a bookkeeper could use — all questions a trade buyer asks at budget time and at year end. |
| FN-19 | No admin form to add or edit a customer account | Dev | P2 | Done | Customer organisations can only be created directly in the database. The country and region dropdowns cannot reach a customer record because there is no screen on which to set them. |
| FN-20 | Invoices were three clicks from the order they belong to | Dev | P2 | Done | A buyer looking at an order who wants its invoice had to leave for Spending, find the right period, and find the reference in a list — to reach a document about the order already on screen. |
| FN-21 | Every account screen can be narrowed to one branch | Dev | P2 | Done | A practice with three clinics does not have one set of orders, one bill and one shopping list — it has three of each, and the manager asking a question is nearly always asking about one of them. |

## Done

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| FN-05 | Real sign-in replaced the demo flag | Dev | P1 | Done | Sign-in was a localStorage boolean anyone could set. It is now a database-backed session with a scrypt-hashed password. |
| FN-06 | Account history is real | Dev | P1 | Done | The account area showed three fabricated orders. It now reads the signed-in user's actual orders, and reorder-first is built from what they have really bought. |
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
| BE-11 | Order pages restricted to their owner | Dev | P1 | Done | An order was readable by anyone who guessed a sequential reference. Now an admin sees any order, the account that placed it sees it, and a guest sees only an order placed from their own cart. |
| DN-18 | Cart moved to the server | Dev | P1 | Done | The cart was localStorage, so the browser held prices. It is now database rows priced entirely on the server; the client cannot tell the server what anything costs. |
| DN-19 | Checkout writes real orders | Dev | P1 | Done | One transaction creates the order, one invoice per supplier and every line, or nothing at all. Reference numbers are allocated server-side inside that transaction. |
| DN-20 | Four sign-in accounts seeded | Dev | P1 | Done | admin, musawi1989@gmail.com, supplier1 and supplier2, each able to sign in by username or email. Suppliers are attached to their seeded companies. |
| DN-21 | Three sign-in doors, one per role | Dev | P2 | Done | Buyers sign in at the account page, suppliers at the business portal, admins at /admin. Signing in at the wrong door names the right one instead of letting someone into the wrong area. |

## Backend

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| BE-01 | Build the backend | Dev | P1 | Done | Express and Prisma per extraction/BACKEND_SPEC.md: roles, auth, orders, invoices, emails. Eight phases. |
| BE-02 | Build the admin panel | Dev | P1 | Done | Products, categories, suppliers, customers, orders, marketing, reports, settings. |
| BE-03 | Build the supplier portal | Dev | P1 | Done | Suppliers manage their own products but can never self-approve. Must have a failing-then-passing test. |
| BE-04 | Build comma-safe .xlsx bulk upload | Dev | P2 | Done | Parsed natively with exceljs, never by splitting on commas — that is what broke the old platform's bulk upload, where a category named Gloves, Nitrile shifted every column after it and the prices were wrong for weeks before anyone noticed. |
| BE-05 | Build the email flows | Dev | P2 | Done | OTP verification, order confirmation, restock alerts, supplier notifications to both primary and secondary addresses. |
| BE-06 | Add an audit log | Dev | P2 | Done | Every status transition and every admin or supplier write should be recorded. |
| BE-07 | Seed the database from the catalogue | Dev | P1 | Done | Done. 146 categories, 71 products, 94 SKUs, 173 price tiers and 4 suppliers loaded from src/data/catalog.json. |
| BE-08 | Decide money representation before any data lands | Accountant | P2 | Open | Money is stored as integer fils rather than Decimal, because SQLite has no native decimal type and Prisma falls back to a float there. Confirm this is acceptable to the accountant. |
| BE-09 | Point the storefront at the database | Dev | P1 | Done | Done. Every page and API route reads Prisma. Client components read a snapshot over HTTP because a browser cannot query the database. |
| BE-10 | Retire the catalogue snapshot endpoint | Dev | P1 | Open | Client components fetch the whole catalogue from /api/v1/catalog/snapshot. Fine for 71 products; not for thousands. Goes away when the cart moves server-side. |
| BE-12 | Merge a guest cart into the user cart on sign-in | Dev | P2 | Open | Carts are keyed by a cookie so a visitor can shop before signing in. The merge on sign-in is specified but cannot be built until auth exists. |
| BE-13 | Expire abandoned guest carts | Dev | P3 | Open | Cart rows are never cleaned up. Every visitor who adds an item creates one that lives forever. |
| BE-14 | Confirm the default order and invoice status | Client | P2 | Open | OUR DECISION: new orders are Pending and each supplier invoice is Pending. The real workflow â€” who moves an order to Processing, and when an invoice becomes Issued â€” is not defined. |
| BE-15 | Passwords were built instead of the specified email OTP | Client | P2 | Open | BACKEND_SPEC.md specifies passwordless sign-in by emailed code. Passwords were requested instead and built. Livingstone advertises password-free login as a feature, so the spec was not arbitrary. |
| BE-16 | Confirm the session lifetime | Client | P3 | Open | OUR INVENTED VALUE: sessions last 7 days, then require signing in again. No idle timeout and no re-authentication for sensitive actions. |
| BE-17 | Purge expired sessions on a schedule | Dev | P3 | Open | Expired session rows are never deleted. purgeExpiredSessions() exists but nothing calls it. |
| BE-18 | Password hashing uses scrypt, not bcrypt | Dev | P3 | Open | OUR DECISION: scrypt from Node's own crypto module, so there is no dependency to keep patched. The spec names bcrypt. Both are appropriate; only src/lib/auth.ts knows the format. |
| BE-19 | Guest checkout is allowed | Client | P2 | Open | OUR DECISION: an order can be placed without signing in, and is then tied to the cart cookie. Signing in simply attaches the order to the account. |
| BE-20 | Build the admin screens behind the dashboard | Dev | P1 | Done | /admin authenticates and shows live figures, but every management screen is still missing: products, categories, suppliers, customers, orders, bulk upload, marketing, reports, settings. |
| BE-21 | Build the supplier portal behind its dashboard | Dev | P1 | Done | The business portal authenticates and shows a supplier their own products and invoice lines, read-only. Creating and editing products, toggling stock and bulk upload are not built. |
| BE-22 | Confirm one supplier account per company | Client | P2 | Open | OUR DECISION: each supplier company links to a single user. Real suppliers usually need several people with their own logins. |
| BE-23 | Admin figures are counted live, never cached | Dev | P3 | Open | OUR DECISION: every number on the admin dashboard is counted from the database on each request. Caching them is how the old platform let admin counts and storefront counts disagree. |
| BE-24 | Supplier data is scoped by query, not by filtering | Dev | P3 | Open | OUR DECISION: a supplier's products and invoice lines are fetched through their supplier id, so another supplier's rows are never loaded rather than loaded and hidden. |
| BE-25 | Invalidate the catalogue cache after a seed or an edit | Dev | P1 | Done | The data layer caches the catalogue for the life of the process, so a running server keeps serving whatever it read first. This is not theoretical: on 15 Aug 2026 the dev server was still showing a retired carton SKU as a purchasable unit chip on the product page, hours after the database had deactivated it. |
| BE-26 | Seed now upserts instead of wiping | Dev | P3 | Done | Once orders existed, re-seeding failed on a foreign key: order lines reference SKU rows. The database was correctly refusing to let a re-seed destroy order history. |
| BE-27 | No marketing screens: wishlists and abandoned carts | Dev | P3 | Done | Both are already recorded in the database and nobody can see either. An abandoned cart is the cheapest sale to recover, and a wishlist says what a buyer wants before they buy it. |
| BE-28 | No reports: sales by supplier, category or period | Dev | P3 | Done | The dashboard totals every order ever placed and nothing else. There is no way to answer which supplier sells most, what a month looked like, or which categories are dead. |
| BE-29 | Product images cannot be uploaded | Dev | P1 | Done | The admin product screen listed the image files a product references but could not add or replace one, so the only way to give a product a photograph was to put a file on disk and re-seed. That blocked DA-03 and DA-24 from ever being closed by the client rather than by us. |
| BE-30 | Capture supplier sub-order lifecycle timestamps and an immutable status log | Dev | P1 | Done | Nothing records when a supplier acknowledged, dispatched or delivered a sub-order, so no fulfilment or lead-time question can be answered about any supplier. Unlike most gaps this one cannot be repaired later: a timestamp not captured at the moment it happened is gone, and the same reasoning already applied to SkuBatch under FN-09. |
| BE-31 | Log every out-of-stock toggle instead of only the current flag | Dev | P2 | Done | The manual out-of-stock checkbox stores current state only. How long a product has been unavailable, and how quickly a supplier restocks, are unanswerable — and both are conversations the admin has with suppliers. |
| BE-32 | Log storefront searches, especially the ones that return nothing | Dev | P2 | Done | A search that returns no results is a customer telling you what to stock, and it is currently discarded. For a distributor deciding what to source next, the list of terms that found nothing is one of the most valuable things the site can produce. |
| BE-33 | Record what each supplier has promised: lead time and acknowledgement SLA | Dev | P2 | Done | On-time means nothing without a promise to measure against. These are numbers agreed personally with each supplier during onboarding, and there is nowhere to put them. |
| BE-34 | No cost price, so no margin is known | Dev | P2 | Done | The system records what a product sells for but not what it costs to buy, so nothing can say whether a line, an order or a supplier is profitable. Requested by the client 16 Aug 2026. |
| BE-35 | Products are hard-tied to one supplier | Dev | P1 | Done | ProductMaster.supplierId was a required field, so every product belonged to exactly one supplier and could not have a backup. It also meant supplier identity was carried on the product record itself, which is how it reached the browser. |
| BE-36 | No purchase orders exist | Dev | P1 | Done | Nothing bought anything. Customer orders were recorded but there was no mechanism to order the goods from a supplier, which is the entire middle of the business. |
| BE-37 | Nothing links received goods back to the customers waiting for them | Dev | P1 | Done | Goods arrive pooled by item, not by customer. Without an allocation record there was no way to know whose units arrived, and no way to answer a recall. |
| BE-38 | Supplier identity is exposed to customers today | Dev | P1 | Done | DEC-24 requires that customers never learn who supplied their goods. Three routes currently break that, and one of them ships supplier records to every visitor's browser. |
| BE-39 | The supplier portal still shows customer orders | Dev | P1 | Done | It listed order references and invoice lines drawn from customer orders, which contradicts DEC-24 now that suppliers deal only in purchase orders. |
| BE-40 | Remove OrderSupplierInvoice, the last of the marketplace model | Dev | P1 | Done | A customer's order was split into one invoice per supplier at checkout. That was right for a marketplace and wrong for what AussieMed is: under DEC-22 AussieMed is the seller of record and issues one invoice, and under DEC-24 the customer never learns a supplier was involved. |
| BE-41 | No admin queue for enquiries | Dev | P2 | Done | Capturing quote requests, bulk-buy enquiries and restock demand without anywhere to read them would only have moved the problem. |
| BE-42 | OrganisationStaff.email is no longer collected | Dev | P3 | Done | The Who orders list records who at a practice placed an order. Nobody on it signs in, so an email address was never used for anything — it was asked for, stored, and read by nothing. Client asked for the field to go on 16 Aug 2026. |
| BE-43 | Account changes were made silently and with no reason attached | Dev | P2 | Done | A customer could add or remove a person from Who orders, add a branch, or remove one, and nothing recorded who did it or why. Six months later the account would show a delivery address nobody could account for. Worse, a branch is where medical supplies get sent: an address added by a customer went live immediately, so the next order could ship to somewhere nobody at AussieMed had ever checked. |
| BE-44 | A refused form deleted everything the person had typed | Dev | P2 | Done | React clears an uncontrolled form as soon as its action returns, success or failure alike. Now that every account change needs a reason, being told the reason is too short also silently deleted the name, the address and everything else just typed — so correcting a small mistake cost more than the original entry did. |
| BE-45 | A purchase order line with no recorded cost was stored as costing zero | Dev | P1 | Done | buildPurchaseOrders wrote unitCostFils ?? 0, so every line drawn from a supply whose cost had not been loaded was saved as free. Downstream that is indistinguishable from a genuine zero, and the realised margin on the customer order it fulfilled came out at 100% — stated confidently on the screen whose entire purpose is deciding whether a trade is worth doing. The pure planner already modelled the cost as nullable and got it right; the flattening happened only at the database write. |
| BE-46 | Nothing recorded that an email had not been sent | Dev | P2 | Done | Quote requests, restock requests and enquiries were stored and never sent, and nothing anywhere said so. A silent failure is the only kind that lasts: an empty inbox looks exactly like a quiet week. |
| BE-47 | The whole catalogue shipped with every admin and supplier page | Dev | P2 | Done | The layout split was meant to stop the storefront's data loading behind the back office, and it did not. The root not-found wraps ShopChrome, which loads every product and hands it to a browser-side provider, and Next includes the root not-found boundary in the payload of every page — so around 150KB of catalogue JSON went out with every /admin and /business-portal response. Visible markup was clean; the data sat in the flight payload where View Source finds it. |
| BE-48 | The daily cutoff could not be changed, and no buyer was told what it was | Dev | P2 | Done | The buying run has always closed at an hour held in a settings row, but nothing could write that row — the value could only be read, so 5pm was effectively hard-coded. Worse, the deadline was invisible on the storefront. A trade buyer deciding whether to order now or in the morning had no way to know which side of the cutoff they were on, and the whole cross-dock model turns on that one time. |
| BE-49 | Reports had nowhere to live in the back office | Dev | P3 | Done | Customers and Suppliers were each a single list. There was no place to ask the other question a section raises — what did they buy, what did we spend, who is slow — so the answers either did not exist or were buried in a screen built for a different purpose. |
| BE-50 | The first card on Needs attention did nothing when clicked | Dev | P2 | Done | Account changes are the one queue that lives on the Needs attention page itself, but its card was built from the same list as the others and linked to /admin/approvals — the page the reader was already on. Clicking it changed nothing and moved nothing, so it read as a broken feature. The queue underneath was working the whole time. |
| BE-51 | No in-site inbox, and no way to send anything on by email | Dev | P2 | Done | Needs attention counts what is outstanding right now and returns to zero when the work is done, so anything worth knowing but not doing had nowhere to live — an order arriving, a supplier confirming. There was also no way to put any of it, or an invoice, in front of somebody by email without retyping it. |
| BE-52 | An admin could see every email but could not write one | Dev | P2 | Done | The Email screen recorded everything the system sent and gave no way to send anything. Any message about an order — it is running late, an item cannot be supplied, the payment is overdue — had to be written from a personal mailbox, which meant it was not recorded anywhere and nobody else could see it had gone. |
| BE-53 | One colour system for every status | Dev | P2 | Done | Colour is how a person reads a list of forty orders without reading it. If the same colour means different things on different screens, or the alarming states are not coloured at all, the list stops being scannable and every row has to be read. |
| BE-54 | Categories could be created and renamed, never removed | Dev | P2 | Done | A taxonomy that only grows is a taxonomy nobody maintains. A category made by mistake stays in the search dropdown and the admin's own screen for the life of the site, and the only way out was a developer with database access. |
| BE-55 | Products could not be added one at a time | Dev | P2 | Done | The bulk upload answers a price list arriving as a spreadsheet. It does not answer the other half of the job — one new line, typed in, usually while somebody is on the phone about it — and there was no way to do that at all. |
| BE-56 | Saving a product from the admin always failed | Dev | P1 | Done | Every edit to a product — name, description, price class, categories — was refused. The admin could open the screen, change anything, press save, and be told a supplier did not exist. |
| BE-57 | Customers could not open an account themselves | Dev | P1 | Done | Every trade account had to be created directly in the database. A business that found the site had no way in at all, and the only route was an email nobody was watching for. |
| BE-58 | Resubmitting an application orphaned an organisation | Dev | P3 | Done | Every abandoned sign-up left an Organisation row with nobody on it — invisible on every screen, and counted by anything asking how many customers exist. |
| BE-59 | A supplier could say whether, but never why | Dev | P2 | Done | Out of stock and discontinued want completely different things from us — one is a wait, the other needs a replacement — and a single checkbox could not tell them apart, so nobody ever acted on the second. |
| BE-60 | Supplier turnaround was never measured | Dev | P2 | Done | Acknowledgement time says how quickly somebody reads an email. It says nothing about whether the goods moved, and a supplier can be excellent at one and poor at the other. |
| BE-61 | Customers are emailed as their order moves | Dev | P2 | Done | A buyer with no idea where their order is rings up. Four well-written emails cost less than four phone calls, provided each one is worth opening. |

## Infrastructure

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| IN-01 | Choose a hosting target | Client | P2 | Open | Nothing is deployed. The site runs locally only. |
| IN-02 | Choose the database | Dev | P2 | Open | SQLite for development with a switch to Postgres. No SQLite-only SQL. |
| IN-03 | Choose an SMTP provider and sending domain | Client | P2 | Open | Required for every transactional email. |
| IN-04 | Decide on a payment gateway | Client | P2 | Open | v1 ships offline / purchase order only. Gateway integration is a pluggable interface. |
| IN-06 | Remove noindex before launch | Dev | P1 | Open | The site is set to noindex, nofollow site-wide so it cannot be indexed while in development. |
| IN-07 | Confirm the GitHub repository is private | Client | P1 | Done | The repository contains the previous agency's purchased theme, fonts and vendor libraries. |
| IN-08 | Correct the git author name | Client | P3 | Open | Commits are authored as 'AussieMed' because git had no identity configured. |
| IN-09 | Set up continuous integration | Dev | P3 | Open | No CI runs the checks automatically. The spec asks for the currency grep check to run in CI. |
| IN-10 | Plan backups and disaster recovery | Client | P3 | Open | No backup strategy exists for the database or uploaded files. |
| IN-05 | Google sign-in is built and waiting on keys | Client | P3 | Open | The button cannot work without OAuth credentials from the client's own Google Cloud project. A button that throws on click reads as a broken site rather than a feature nobody has enabled. |

## Deferred

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| DF-01 | Industry taxonomy | Dev | P3 | Deferred | A second navigation tree by customer type (Healthcare, Dental, Laboratory, Education, Hospitality, Beauty, First Aid, Facilities) alongside product categories. |
| DF-02 | Subscribe and Save | Dev | P3 | Deferred | Recurring scheduled orders. Pairs naturally with the reorder-first account. |
| DF-03 | Frequently bought together | Dev | P3 | Deferred | Bundle suggestion with a combined total and one action to add all. |
| DF-04 | Quick view | Dev | P3 | Deferred | View a product from the listing without a page load. |
| DF-05 | Downloadable PDF catalogues | Client | P3 | Deferred | Still how a lot of trade buying happens. |

## Security

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| SEC-01 | Remove the test credentials before any deployment | Client | P1 | Open | Four accounts share the password 123456: admin, musawi1989@gmail.com, supplier1, supplier2. Fine on a laptop, unacceptable anywhere else. |
| SEC-02 | Add rate limiting to sign-in | Dev | P2 | Done | Nothing limits password attempts, so the sign-in endpoint can be brute forced. The spec asks for rate limiting on auth in the hardening phase. |
| SEC-03 | Agree a password policy | Client | P2 | Open | No minimum length, complexity or reuse rule is enforced. 123456 was accepted because nothing rejects it. |
| SEC-04 | Admin authorisation is enforced twice, deliberately | Dev | P2 | Done | A server action is a public HTTP endpoint. Hiding a button does not stop anyone posting to it, so the role is checked in the layout for rendering and again in the service layer for every write. |
| SEC-05 | Customer identity must never reach a supplier | Dev | P1 | Done | The mirror of BE-38 and equally load-bearing. A supplier seeing which clinics buy what would hand them the client book. |
| SEC-06 | Sign-in tells an applicant why they are being held up | Dev | P2 | Done | A generic refusal must not reveal which addresses have accounts. But after a correct password, the same generic message to somebody whose application is in a queue is a lie that produces a support call. |
| SEC-07 | The replacement picker offered the whole catalogue | Dev | P2 | Done | A dropdown listing every pack we sell lets one supplier read our entire range, and infer from it what a competitor supplies. |

## Decision

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| DEC-01 | Fresh build â€” the previous site is reference only | Client | P3 | Done | Stated 14 Aug 2026: nothing to do with the previous site. The extraction is mined for data and business rules; its code and behaviour are discarded. |
| DEC-02 | Keep the existing visual brand | Client | P3 | Done | Stated 14 Aug 2026, correcting an earlier over-broad reading: the storefront must keep the current AussieMed look, not be redesigned. |
| DEC-03 | Local only until the client approves | Client | P3 | Done | Stated 14 Aug 2026: not to go online until there is a version they are happy with locally. |
| DEC-04 | External connectors are handled last | Client | P3 | Done | Stated 14 Aug 2026: anything needing a third-party account waits until the end so the build never stalls on credentials. |
| DEC-05 | Follow Livingstone for B2B catalogue and pricing behaviour | Client | P3 | Done | Stated 14 Aug 2026 with livingstone.com.au as the reference, and all suggested changes accepted. |
| DEC-06 | Seed the catalogue from two real suppliers for testing | Client | P3 | Done | Stated 14 Aug 2026: list Chemist Warehouse and Livingstone as suppliers with 30 items each, and remove the invented placeholders. |
| DEC-07 | Add product images | Client | P3 | Done | Stated 15 Aug 2026. Supplier photography was downloaded for local testing. |
| DEC-08 | Four test accounts with a shared placeholder password | Client | P3 | Done | Stated 15 Aug 2026: admin, musawi1989@gmail.com, supplier1 and supplier2, all with 123456. Explicitly described as local testing only, chosen to be memorable, and to be changed before anything real. |
| DEC-09 | One sign-in door per role | Client | P3 | Done | Stated 15 Aug 2026: the business portal is the supplier login, the account login is for buyers, and admin is reached at /admin. |
| DEC-10 | Record every generated value and decision in this register | Client | P3 | Done | Stated 14 Aug 2026 and repeated 15 Aug: everything invented on the client's behalf must be written down rather than left in the code. |
| DEC-11 | Price breaks are packaging levels, not arbitrary quantities | Client | P3 | Done | Stated 15 Aug 2026: a break at 12 exists because a carton holds 12, and a break at 48 because a box holds 4 cartons. The quantity and the packaging level are the same fact. |
| DEC-12 | Variants are a dropdown across sibling products | Client | P3 | Done | Stated 15 Aug 2026: the 375ml and the 60ml stay as separate products, and each carries a dropdown listing the whole family so a buyer can find their part quickly. |
| DEC-13 | One sign-in button in the header, with a dropdown per role | Client | P3 | Done | Stated 15 Aug 2026: replace the Business portal and Account links with a single blue Sign in button whose dropdown offers sign in as a buyer and sign in as a supplier. |
| DEC-14 | The AED label and the Ex/Inc VAT toggle are gone from the header | Client | P3 | Done | Stated 15 Aug 2026: remove the AED text and the VAT options because VAT is to be carried in the displayed price later. |
| DEC-15 | Sign out lives in the header, in the sign in button slot | Client | P3 | Done | Stated 15 Aug 2026: the sign out button always sits where the Sign in button would be when signed out. |
| DEC-16 | Empty categories are hidden from navigation, not removed | Dev | P3 | Done | The category tree came from Livingstone and is far wider than the 60 test products fill. Hiding what is empty keeps every menu entry useful; removing them would lose the shape of the intended range, and hard-coding a shorter list would need maintaining by hand. |
| DEC-17 | Renaming a category does not change its URL | Dev | P3 | Done | The slug is the address. A category that has been linked to, bookmarked or indexed keeps working when its display name changes, and changing both would silently break every existing link. |
| DEC-18 | A product cannot go live without a SKU and a category | Dev | P3 | Done | Both make a live product broken rather than merely incomplete: no SKU means nothing to buy, no category means nobody can browse to it. The admin screen refuses the transition and says which one is missing. |
| DEC-19 | Delivered and cancelled orders cannot be reopened | Client | P3 | Done | Both are closed documents the customer already holds. A status that contradicts what they received is worse than no status at all. |
| DEC-20 | The back office looks like the reference operations UI, not like the shop | Client | P3 | Done | The client supplied screenshots of the tool they use day to day. Staff processing orders are doing operational work, and the storefront chrome was both a distraction and the reason documents printed badly. |
| DEC-21 | Uploaded files go through a storage seam, not straight to disk | Dev | P3 | Done | Local disk is right for a laptop and wrong for most hosting: a container filesystem is discarded on every deploy, and two instances behind a load balancer do not share one. Hosting is IN-01 and is not chosen yet. |
| DEC-22 | AussieMed is the seller of record | Client | P3 | Done | Determines who carries the VAT liability and the credit risk, what the customer's invoice looks like, and who chases payment. It had been drifting undecided while the build leaned the other way. |
| DEC-23 | VAT is a checkout concern only | Client | P3 | Done | Settles a question open since the Ex/Inc VAT toggle was removed: whether buyers need to see VAT while browsing. |
| DEC-24 | AussieMed is a cross-dock distributor, not a marketplace | Client | P1 | Done | Changes what the platform fundamentally is. Neither side of a transaction may see the other, which rules out the supplier-facing order model the build had grown. |
| DEC-25 | Two suppliers per item, with automatic fallback | Client | P1 | Done | A single supplier per product makes every product only as reliable as one company, and in cross-dock a supplier who cannot supply means a customer waits a full cycle. |
| DEC-26 | One consolidated purchase order per supplier per day | Client | P1 | Done | Sending a purchase order per customer order would flood suppliers and lose the buying power of pooled quantities. |
| DEC-27 | The whole category tree is visible, stocked or not | Client | P2 | Done | The site should advertise the range AussieMed sells, not the 23 categories the 71 placeholder products happen to fill. Hiding the rest made a supplier of medical, dental, laboratory, cleaning, kitchen, office, pet and tattoo supplies look like a supplier of eight departments, and gave the client no way to see on the storefront the tree they had just approved. |
| DEC-28 | The cutoff runs every day, weekends included | Client | P2 | Done | The daily purchase-order cutoff had no weekend rule because none had been agreed, and the buyer-facing countdown sits on every storefront page. On a Saturday it counts down to a run nobody has agreed to work. |
| DEC-29 | Customers get printable invoices, not spreadsheets | Client | P2 | Done | Asked on 18 Aug 2026 how bulk invoice downloads should work, given that a folder of PDFs would need two new dependencies. The client's answer was to remove the spreadsheets instead. |
| DEC-30 | Email stays plain text | Client | P3 | Done | Every message the platform sends is plain text. It was built that way because the alternative meant inventing a brand email look nobody had approved, and the question was left open rather than decided by default. |
| DEC-31 | Stock is in or out, and quantities are never tracked | Client | P2 | Done | Products carry a single in-stock flag with no quantities anywhere, so there are no low-stock warnings and no backorders. Left open since the build began as a question about whether real stock levels were needed. |
| DEC-32 | Postgres on managed hosting for production | Client | P2 | Done | The site runs on a SQLite file, which is right for building and wrong for a live storefront: one writer at a time, and nowhere to keep a file on hosting that replaces the disk on every restart. |
| DEC-33 | Reordering is from a past order, not from a list of everything ever bought | Client | P2 | Done | The spec asked for a Buy Again list — every product the account has ordered, each with an add-to-cart. The client had already removed exactly that grid from the account area on 16 Aug 2026 in favour of reordering a specific past order. |

## Frontend

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| FE-33 | The back office had the shop wrapped around it | Dev | P2 | Done | Every admin and supplier screen rendered inside the storefront header and footer, so warehouse staff worked around a cart and a Browse All Category bar, and the printed order documents carried both onto the paper. |
| FE-34 | The delivery address printed as raw JSON | Dev | P2 | Done | The address is stored as a JSON snapshot so editing an address book entry cannot alter where a historical order was sent. Two screens printed that string verbatim, including the delivery note the customer receives. |
| FE-35 | Withdrawn: the first admin page after signing in was reported as showing the sign-in door | Dev | P3 | Done | Recorded on 16 Aug 2026 as a defect. It was not one — the finding was an artefact of the test that produced it, and the record is kept so nobody investigates it a second time. |
| FE-36 | The 404 page rendered its header and footer twice | Dev | P2 | Done | Introduced by the (shop) route group split in c75b2b5 and live for one commit. An unmatched URL was fine; a notFound() thrown inside the storefront — an unlisted product, an order reference that is not yours — came out with two headers and two footers. |
| FE-41 | The filter bar is a box of its own, opened where the buyer clicked | Dev | P2 | Done | The filter was an unframed column that scrolled with the page. At 445 categories, arriving from a front-page tile landed a buyer at the top of an alphabetical list with the category they had just chosen somewhere below the fold, and scrolling to find it scrolled the products away as well. |
| FE-42 | Filter sections fold, and price and volume breaks were added | Dev | P2 | Done | The brand list is every brand in whatever the buyer is looking at — twenty-six on the full catalogue — sitting open between them and the bottom of the panel. And the only things that could be filtered were category, brand and in-stock, on a trade site whose whole argument is volume pricing. |
| FE-43 | The header is one bar, and it gets out of the way | Dev | P2 | Done | The header was two stacked rows — a white utility bar above a navy nav bar — taking about 140 pixels off every screen before a buyer saw a product, and staying there for the whole scroll. |
| FE-44 | Filter by business or practice | Dev | P2 | Done | The client supplied the eighteen trades they sell to, with codes, and asked for them as a filter. A dental clinic and a cafe buy from almost disjoint halves of a 2,057-product catalogue, and neither wants to start at Medical Consumables and work it out. |
| FE-45 | A product performance report, and what to make our own | Dev | P2 | Done | The client asked what earns the most on margin and sales, what is bought most, and anything similar that would help decide what to put an AussieMed label on. Nothing reported on products at all: the existing reports cover customers and suppliers. |

## Note

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| DN-22 | The dashboard metrics spec is an idea source, not a plan | Dev | P3 | Done | A specification document generated on 16 Aug 2026 proposes roughly sixty metrics across three dashboards. It was written without sight of this codebase, so it assumes work that is already done and priorities that are not ours. |

## Front end

| ID | Item | Owner | Priority | Status | Why it matters |
| --- | --- | --- | --- | --- | --- |
| FE-37 | The printable invoice was a printed web page | Dev | P2 | Done | An invoice is the document a customer files, forwards to their accountant and pays against. One that arrives with a search box and a navigation menu across the top reads as amateur, and reflects on every figure printed underneath it. |
| FE-38 | A refused form threw away everything that had been typed | Dev | P2 | Done | Being told what is wrong and losing the work in the same instant makes the correction cost more than the original entry. On a long form it is the difference between a usable screen and one people avoid. |
| FE-39 | Addresses were free text, with no country at all | Dev | P2 | Done | Free text means Dubai, dubai, DXB and Dubaie are four places, and that is discovered later by whoever tries to group orders by region. No country field at all means a supplier in Guangzhou and a branch in Muscat cannot be recorded correctly. |
| FE-40 | Status colours are settable by an admin | Dev | P3 | Done | The five tones carry meaning across every screen. A client who wants them to match their brand should not need a developer, and should not be able to break the meaning while doing it. |
