# AussieMed Storefront Extraction — 13 Aug 2026

Complete front-end extraction of https://aussiwebsite.r-y-x.net (staging), taken as raw
material for rebuilding the storefront as a standalone JavaScript app.

## What's inside

```
data/
  products.json      11 products: IDs, SKUs, names, detail keys, AED prices,
                     tier pricing (qty1-3 / price1-3), unit, supplier IDs, image refs.
                     Product 180 (Vaseline) is flagged — it vanished from the live
                     listing mid-extraction (evidence of a known bug).
  categories.json    146 categories (id -> name) from the storefront nav.

site/
  assets/            Theme CSS, JS, fonts, images — incl. assets/img/logo/logo.png
  content-admin/     Uploaded content served from the admin host (aussi.r-y-x.net):
                     product images, CMS/WebHtml images, organisation logo.
  _pages/            Rendered HTML of every page: home, product list (3 pages),
                     cart (with a live item in it), about, contact, bulk-buy,
                     wishlist, quote cart, product range, terms, privacy,
                     order support, plus pdp_<id>.html for all 11 products.
```

## What could NOT be extracted (needs source code / admin access)

- The ASP.NET C# backend: cart/checkout server logic, auth, order processing, emails
- The database: customers, orders, suppliers, stock levels
- The admin panel and supplier portal (behind login)
- Admin-only product fields: cost prices, secondary supplier emails, SEO metas
  (SEO fields render empty on the live site anyway)

## Rebuilding with Claude Code

From a terminal:

```
mkdir aussiemed-js && cd aussiemed-js
# copy/unzip this package so ./extraction contains data/ and site/
claude
```

Then paste the prompt below.

---

## PROMPT FOR CLAUDE CODE

You are rebuilding the AussieMed B2B medical-supplies storefront as a standalone
JavaScript app. `./extraction` contains a full mirror of the original site:
`site/_pages/*.html` are the rendered originals of every page (use them as the
visual reference), `site/assets` + `site/content-admin` are all CSS/JS/fonts/images,
and `data/products.json` + `data/categories.json` are the live product and
category data.

Build:
- Vanilla HTML/CSS/JS front-end plus a minimal Node.js/Express server. No database.
  Serve data through a small API layer (GET /api/products, /api/products/:id,
  /api/categories, /api/search?q=) reading from data/*.json, so the real backend
  can replace it later without touching the UI.
- Match the original design exactly: reuse the extracted CSS, fonts and images.
  Copy image files into the project; rewrite absolute aussi.r-y-x.net image URLs
  to local paths.
- Pages: Home, Product List (working pagination), Product Detail, Cart, Wishlist,
  About, Contact, Bulk Buy Request, Terms, Privacy, Order Support.
- Working features: add-to-cart with tier pricing (each product has qty1-3 quantity
  breaks mapping to price1-3), cart +/- buttons AND manual quantity entry, wishlist
  toggle, search over products.json, category filtering that actually filters
  (the original redirected every category to the full list — that was a bug;
  implement it properly using categories.json), out-of-stock state that swaps
  Add to Cart for a Notify Me button, VAT 5% line in the cart summary.
- Cart and wishlist persist in localStorage. Checkout is a stub: an order summary
  page that POSTs to the Express server, which writes the order as JSON into
  ./orders/ and returns a reference number (display it as "Reference number",
  never "order number").
- Currency: AED only, always the English text "AED", always 2 decimals.
  Quantities are integers.

Fix — do not copy — these bugs from the original:
1. Cart renders the Arabic symbol "د.إ" and 4-decimal prices (e.g. "د.إ 35.9700");
   must be "AED 35.97". The JS fallback symbol is also hardcoded to د.إ.
2. Quantities render as decimals ("3.00") — must be integers.
3. Every page has the identical title "Aussie Med || Home" and empty meta
   descriptions — give every page and product a unique title (~60 chars) and
   meta description (~155 chars) built from the product data.
4. Cart product images are broken (src is a bare domain with no path).
5. Category links do not filter (see above).
6. Contact email is misspelled "info@assuiemed.com" — use info@aussiemed.com
   (TODO: confirm final address).
7. Literal unresolved "~/" asset paths (og:image, owl.carousel script tag).
8. Leftover template artifacts: "Error loading scores" console message,
   commented-out dead quantity-handler code.

PART 2 — FULL BACKEND. After the storefront works against the JSON files,
build the complete backend by following ./extraction/BACKEND_SPEC.md exactly:
Express + Prisma/SQLite, roles (Admin/Supplier/Customer), auth with email OTP,
cart/checkout producing one invoice per supplier per order, supplier portal
where suppliers can never self-approve products, admin panel (products,
categories, suppliers, customers, orders, marketing, reports, settings),
.xlsx bulk upload that is comma-safe, Notify Me restock emails, quotes, and
the reorder-first account view. Replace the JSON data layer from Part 1 with
the database + /api/v1 endpoints. Work phase by phase as listed in the spec
(section 9), committing after each phase, and write the acceptance tests named
in the spec — especially: supplier self-approval returns 403, a two-supplier
checkout creates exactly two invoices, category counts always equal visible
products, and the characters د.إ appear nowhere in the codebase.

Seed the database from ./extraction/data (11 products, 146 categories) per
spec section 8 so the app is browsable immediately.

---

## Notes

- Theme licence: the front-end theme was likely purchased under the dev agency's
  account. When you get the handover, ask for the theme licence to transfer.
- This staging host has no robots.txt and is publicly reachable — the rebuild
  should ship with robots.txt Disallow:/ until production launch.
