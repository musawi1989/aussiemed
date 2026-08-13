# AussieMed Backend Specification — full JS rebuild

Clean-room reimplementation of the AussieMed marketplace backend in Node.js.
The original C# backend is not available; this spec is derived from the observed
live behaviour, the platform's locked-in product decisions, and its known-bug
history. Where the original had bugs, this spec designs them out — do not
replicate bugs.

## 1. Stack

- Node.js 20+, Express
- SQLite via Prisma ORM (migrations included; Postgres-ready by changing the
  datasource — do not use SQLite-only SQL)
- Sessions: express-session with SQLite store; bcrypt for passwords
- nodemailer for email (console/file transport in dev; SMTP creds via .env)
- multer + exceljs for bulk upload (.xlsx native)
- zod (or similar) for input validation on every write endpoint

## 2. Roles

Guest, Customer (clinic buyer), Supplier, Admin.
Server-side enforcement on every route — never trust the client for role checks.

CRITICAL (SEC/SUP history): a Supplier can create and edit their own products
but can NEVER set a product to Active/Approved. Approval is an Admin-only
transition, enforced in the service layer, not just hidden in the UI. Add a test
that a supplier session POSTing status=Active gets 403 and the status is unchanged.

## 3. Data model (Prisma sketch)

- User(id, email unique, passwordHash, role, name, phone, isVerified, otpCode?, otpExpiresAt?, createdAt)
- Supplier(id, userId FK, companyName, primaryEmail, secondaryEmail NOT NULL, phone, address, status)
  — secondaryEmail is mandatory at creation (locked decision).
- Category(id, name, parentId?, isActive)  — names MAY contain commas; nothing
  may ever parse category lists by splitting on commas.
- Brand(id, name unique, isActive)
- ProductMaster(id, name, slug unique, description, brandId?, supplierId FK,
  status enum: Draft | PendingApproval | Active | Inactive,
  createdBy, approvedBy?, approvedAt?, metaTitle?, metaDescription?, createdAt)
- ProductSku(id, productMasterId FK, skuCode, variantLabel, unit,
  priceAED decimal(10,2), tierQty1..3 int?, tierPrice1..3 decimal(10,2)?,
  manualOutOfStock boolean default false, weight?, barcode?)
- ProductCategory(productMasterId, categoryId) many-to-many
- ProductImage(id, productMasterId, skuId?, path, sortOrder)
- CartItem(id, cartKey, userId?, skuId FK, qty int CHECK qty >= 1, unitPriceAED, createdAt)
  — cartKey supports guest carts (cookie); merge into user cart on login.
- WishlistItem(id, userId, productMasterId, createdAt)
- NotifySubscription(id, email, skuId FK, notifiedAt?, createdAt)
- QuoteRequest(id, userId?, contactEmail, status, createdAt) + QuoteItem(quoteId, skuId, qty)
- Order(id, referenceNumber unique e.g. "AM-2026-000123", userId, status,
  subtotalAED, vatAED, totalAED, shippingAddress json, paymentMethod, createdAt)
- OrderSupplierInvoice(id, orderId FK, supplierId FK, invoiceNumber unique,
  subtotalAED, vatAED, totalAED, status)
  — UNIQUE(orderId, supplierId). This constraint is the structural fix for the
  historical duplicate-invoice bug on multi-supplier orders.
- OrderItem(id, orderId, invoiceId FK, skuId, qty int, unitPriceAED, lineTotalAED)
- BulkUploadJob(id, supplierId?, uploadedBy, filename, status, totals json, createdAt)
  + BulkUploadRow(jobId, rowNumber, outcome enum Created|Skipped|Error, message, productMasterId?)
- AbandonedCart(view or job output: carts with items, no order, older than X hours)
- AuditLog(id, actorUserId, action, entity, entityId, before json, after json, at)
  — log every status transition and every admin/supplier write.

Money: store DECIMAL, render exactly 2 decimals, always "AED " prefix in English.
Quantities: integers everywhere. VAT: 5%, calculated at order time and stored.

## 4. Business rules (locked platform decisions)

1. Reorder-first: a logged-in customer's default landing surfaces their
   previously ordered items with one-tap reorder (GET /api/account/reorder-list
   from order history). Catalogue browsing is secondary.
2. Manual out-of-stock: manualOutOfStock checkbox per SKU. When true: PDP and
   cards show Notify Me instead of Add to Cart; AddCart for that SKU returns 409.
   When flipped back to false: send restock email to all NotifySubscriptions for
   that SKU that have notifiedAt = null, then set notifiedAt.
3. Bulk upload: .xlsx parsed natively with exceljs (never CSV comma-splitting —
   this is what broke comma-containing category names). Categories resolved by
   exact cell value; multi-category via a REPEATED COLUMN or newline separator,
   not commas. All created products default status = PendingApproval (Inactive
   on the storefront). Unknown brand name → row Skipped with explicit message in
   the row report (never silent). Job report downloadable per upload.
4. All Active products display on the storefront regardless of data
   completeness (missing images/descriptions render with placeholders, never
   hidden). Activation must be visible on the storefront immediately — no
   cache layer without explicit invalidation on status change.
5. Wording: customer-facing documents and pages say "Reference number", never
   "order number".
6. Wishlists and Abandoned Carts live under the Admin > Marketing menu.
7. Currency: AED only for v1 (schema keeps currencyId for future). The string
   is always English "AED". Grep-level acceptance check: the characters د.إ
   must not exist anywhere in the codebase or templates.

## 5. API surface (clean /api/v1; observed original routes in comments for reference)

Public:
- GET /api/products?category=&brand=&q=&page=&inStock=        (orig: ProductList/ProductListApply/GoCategory)
- GET /api/products/:idOrSlug                                  (orig: ProductDetails?key=)
- GET /api/categories  (tree, each node with LIVE count of Active products —
   counts must be computed from the same query that lists products, so admin
   count and storefront count can never diverge: the historical mismatch bug)
- GET /api/search/suggest?q=                                   (orig: SearchSuggestions)
- POST /api/notify-me {skuId, email}                           (orig: NotifyMe)
- POST /api/contact  |  POST /api/business-query               (orig: SubmitContactUs/SubmitBusinessQuery)

Auth:
- POST /api/auth/register (customer; email OTP verify), /api/auth/verify-otp,
  /api/auth/login, /api/auth/logout, /api/auth/forgot-password (OTP), /api/auth/reset-password
- Social login: stub endpoints returning 501 with a TODO (needs Google/Facebook keys).

Cart & checkout (guest-capable via cookie cartKey):
- GET /api/cart | POST /api/cart/items {skuId, qty} | PATCH /api/cart/items/:id {qty}
  (absolute qty, integer >= 1 — manual entry fully supported) | DELETE /api/cart/items/:id | DELETE /api/cart
- POST /api/checkout {addressId | newAddress, paymentMethod}
  → creates Order + one OrderSupplierInvoice per distinct supplier in the cart,
  in ONE transaction; returns referenceNumber. Payment v1: "Offline / Purchase
  Order" method only; gateway integration is a pluggable interface (TODO: decision).

Account (customer):
- GET /api/account/orders, GET /api/account/orders/:ref, POST /api/account/orders/:ref/reorder
- GET/POST/DELETE /api/account/wishlist                        (orig: ToggleWishlist etc.)
- Quote flow: POST /api/quotes (from cart or PDP), GET /api/account/quotes   (orig: QuoteCart)

Supplier portal (/api/supplier/*, role=Supplier):
- CRUD own products & SKUs (status limited to Draft|PendingApproval),
  toggle manualOutOfStock, upload images, POST bulk-upload (.xlsx) → job + row report,
  GET own orders/invoices (only their own lines), GET dashboard stats.

Admin (/api/admin/*, role=Admin):
- Products: list all statuses, approve/reject (PendingApproval→Active|Inactive), edit, delete
- Categories & Brands CRUD (renames must cascade safely)
- Suppliers: create (secondaryEmail required), edit, suspend
- Customers: list, view, disable
- Orders & invoices: list, detail, status transitions, resend emails
- Marketing: wishlist report, abandoned carts (cart age > 24h, with contact)
- Reports: sales by supplier/category/period (CSV export)
- Settings: VAT rate, email templates, general config
- Bulk upload monitor: all jobs + row reports

## 6. Emails (table-based HTML, dev = file transport writing .html to /outbox)

- Customer: OTP verify, order confirmation (reference number wording), quote received
- Supplier: to BOTH primary and secondary email — new order lines for them, product approved/rejected
- Notify Me restock (on OOS→in-stock flip)
- Admin: new supplier registration, bulk upload completed

## 7. Frontend integration

The Part-1 storefront consumes /api/v1. Add server-side rendering only where the
extraction shows it matters (titles/meta per page). Admin and Supplier portals:
simple server-rendered pages (EJS) or a light SPA under /admin and /supplier —
prioritise function over polish; reuse the extracted theme CSS.

## 8. Seed & fixtures

- prisma/seed.ts imports ../extraction/data/products.json and categories.json
  (11 products incl. flagged Vaseline #180, 146 categories), creates:
  admin@aussiemed.local / Admin123! (force change), two demo suppliers (with
  secondary emails), one demo customer with a past order so reorder-first works
  on first login, one SKU with manualOutOfStock=true to exercise Notify Me.

## 9. Build phases (do them in order; commit per phase)

1. Scaffold + Prisma schema + migrations + seed. Smoke: /api/products returns 11.
2. Storefront read APIs + search + category counts. Acceptance: category count
   equals visible product count for every category (automated test).
3. Cart + checkout + orders + invoices-per-supplier (transactional). Acceptance:
   a 2-supplier cart produces exactly 2 invoices, re-running the request cannot
   produce duplicates.
4. Auth + account + wishlist + quotes + reorder-first.
5. Supplier portal + bulk upload (.xlsx, comma-safe) + permission tests
   (supplier cannot self-approve — must have a failing-then-passing test).
6. Admin panel + marketing + reports + settings.
7. Emails + Notify Me flow end to end.
8. Hardening: validation on all writes, audit log, rate limiting on auth,
   robots.txt Disallow:/ until production, and the د.إ grep check in CI.

Map tests to the Master Testing Checklist module codes where possible
(SUP, ADM-PRD, ADM-CAT, ADM-BLK, ADM-SUPM, ADM-CUS, ADM-ORD, ADM-PAY, ADM-MKT,
ADM-RPT, ADM-GEN, EML, SEC, XCT) so the existing checklist doubles as the
acceptance suite.

## 10. Open decisions (flag in README of the build, don't block on them)

- Payment gateway (v1 ships Offline/PO only)
- Google/Facebook OAuth keys
- SMTP provider + sending domain (must NOT be the misspelled assuiemed.com)
- Hosting target (spec is host-agnostic Node; SQLite→Postgres switch when chosen)
