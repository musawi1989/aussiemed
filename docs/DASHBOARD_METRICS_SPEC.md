# AussieMed Dashboard Metrics Specification
### For implementation by Claude Code — Admin Panel, Supplier Portal, Client Dashboard

**Version:** 1.0 | **Date:** 16 Aug 2026
**Platform context:** UAE B2B medical supplies marketplace. Reorder-first model. AED currency displayed in English. VAT 5%. Multi-supplier order splitting exists. "Reference number" terminology (never "order number"). Timezone: Asia/Dubai (UTC+4).

---

## 0. Design principles (read first)

AussieMed is a **relationship-led B2B marketplace**. Suppliers and clients are onboarded and managed personally by the admin team. Scaling is deliberate, not explosive, and the admin retains manual control of most functions. This changes the design brief:

1. **Visibility over automation.** Metrics exist to inform manual decisions and personal conversations — not to trigger automated penalties, automated supplier ranking, or automated marketing. No metric in this spec auto-executes anything.
2. **Action queues, not just charts.** Every dashboard section should answer "who needs my attention today?" — orders stuck too long, clients overdue to reorder, suppliers slipping on lead time.
3. **Per-supplier and per-client drill-down is the core unit.** Aggregate numbers are secondary. The admin manages a small, known set of relationships and needs to see each one clearly.
4. **All order metrics compute at the supplier sub-order level.** Because a single client order splits across suppliers, fulfilment metrics are meaningless at the parent-order level. Compute per sub-order, then roll up.
5. **Simple math, explainable numbers.** Medians and simple percentages the admin can defend in a supplier meeting. No ML, no black boxes.

---

## 1. Data model prerequisites

These fields/events must exist before the metrics can be computed. **This is the first thing to build.**

### 1.1 Order lifecycle timestamps (per supplier sub-order)

| Field | Type | Set when |
|---|---|---|
| `placed_at` | datetime | Client completes checkout (exists already on parent order — copy/link to each sub-order) |
| `supplier_notified_at` | datetime | Order notification email sent to supplier (primary + secondary email) |
| `acknowledged_at` | datetime | Supplier clicks "Accept/Acknowledge" in the portal (**new portal action — add an Acknowledge button/status**) |
| `dispatched_at` | datetime | Supplier marks sub-order as dispatched/shipped |
| `delivered_at` | datetime | Marked delivered (by supplier, admin, or client confirmation) |
| `cancelled_at` | datetime | Sub-order cancelled |
| `status` | enum | `placed → acknowledged → processing → dispatched → delivered` plus `cancelled`, `partially_fulfilled` |

**Rule:** every status change writes an immutable row to an `order_status_log` table (`sub_order_id, old_status, new_status, changed_by, changed_at`). Never overwrite timestamps.

### 1.2 Supplier configuration fields (admin-editable, per supplier)

| Field | Type | Purpose |
|---|---|---|
| `promised_lead_time_days` | integer | The delivery lead time this supplier has committed to (agreed personally during onboarding). Drives on-time calculation. |
| `ack_sla_hours` | integer | How quickly the supplier should acknowledge new orders (default 24). Drives the "stuck orders" queue. |
| `account_owner` | text | Which admin team member owns this relationship (optional but useful). |
| `relationship_notes` | text | Free-text notes visible only to admin. |

### 1.3 Sub-order line fulfilment fields

| Field | Purpose |
|---|---|
| `qty_ordered`, `qty_shipped` per line | Enables fill-rate / in-full calculation. If partial shipments aren't supported yet, treat any shipped sub-order as in-full and tag the metric P2. |

### 1.4 Out-of-stock event log

The manual OOS checkbox must **log every toggle**: `product_id, supplier_id, oos_set (true/false), toggled_by, toggled_at`. This enables days-out-of-stock and restock-speed metrics. Currently the checkbox only stores current state — add the log.

### 1.5 Notify Me subscriptions (exists — extend)

Ensure each Notify Me record stores: `product_id, client_id, created_at, notified_at (nullable), converted_order_ref (nullable)`. The conversion link can be set manually or matched when the same client orders the product within 14 days of notification.

### 1.6 Client configuration fields

| Field | Purpose |
|---|---|
| `account_owner` | Admin team member who owns the relationship. |
| `client_type` | Clinic / hospital / pharmacy / lab / other (segment filter). |
| `expected_order_frequency_days` | Optional manual override; otherwise computed (see A-14). |

### 1.7 General computation rules

- **Period selector** on every dashboard: This month / Last month / Last 30 days / Last 90 days / Last 12 months / Custom range. Default: last 30 days.
- **Days** = calendar days by default; add a global config flag `use_business_days` (UAE weekend = Sat–Sun) for later.
- Report **median and P90** alongside averages for all duration metrics (one slow outlier shouldn't hide in a mean, and P90 shows the bad days).
- Exclude cancelled sub-orders from lead-time metrics; count them in cancellation rate.
- All money in AED, English formatting (e.g., AED 12,450.00). VAT-inclusive vs exclusive: show **GMV excluding VAT** as the headline, with VAT shown separately.
- Precompute nightly rollup tables per supplier/client/product per day; volumes are low, so real-time queries are also fine — nightly rollups are just cheaper and simpler.

---

## 2. ADMIN DASHBOARD

### 2.1 Business overview (top of dashboard)

| # | Metric | Definition / formula | Priority |
|---|---|---|---|
| A-1 | GMV (AED) | Sum of delivered + in-progress sub-order values (ex-VAT) in period, with % change vs previous equal period | P1 |
| A-2 | Orders | Count of parent orders in period; also show sub-order count | P1 |
| A-3 | Average order value | GMV ÷ parent order count | P1 |
| A-4 | Active clients | Distinct clients with ≥1 order in period; show alongside total registered clients | P1 |
| A-5 | Active suppliers | Distinct suppliers with ≥1 sub-order in period ÷ total active-listed suppliers | P1 |
| A-6 | Reorder rate | % of parent orders in period placed by clients who had ordered before (any prior order) | P1 |
| A-7 | Repeat client rate | % of clients with ≥2 lifetime orders (of clients with ≥1 order older than 30 days) | P2 |
| A-8 | Client concentration | % of period GMV from top 5 clients (dependency risk — important for a small book of business) | P1 |
| A-9 | Supplier concentration | % of period GMV from top 5 suppliers | P1 |
| A-10 | New clients | Clients whose first order falls in period | P1 |
| A-11 | Cancellation rate | Cancelled sub-orders ÷ all sub-orders in period | P1 |

### 2.2 Supplier performance table (the fulfilment-speed section)

One row per supplier, sortable by every column. Clicking a supplier opens a drill-down with the same metrics charted over time plus the raw sub-order list. **This is the table the admin brings to supplier meetings.**

| # | Metric | Definition / formula | Priority |
|---|---|---|---|
| S-1 | Sub-orders in period | Count | P1 |
| S-2 | GMV via supplier (AED) | Sum of sub-order values ex-VAT | P1 |
| S-3 | **Acknowledgement time** | Median & P90 of (`acknowledged_at − placed_at`) in hours | P1 |
| S-4 | **Dispatch time** | Median & P90 of (`dispatched_at − placed_at`) in days | P1 |
| S-5 | **Delivery time** | Median & P90 of (`delivered_at − dispatched_at`) in days | P1 |
| S-6 | **Total fulfilment lead time** | Median & P90 of (`delivered_at − placed_at`) in days — *the headline "how long does this supplier take" number* | P1 |
| S-7 | On-time rate | % of delivered sub-orders where (`delivered_at − placed_at`) ≤ `promised_lead_time_days` | P1 |
| S-8 | In-full rate | % of delivered sub-orders with all lines `qty_shipped = qty_ordered` | P2 (needs 1.3) |
| S-9 | OTIF | % of sub-orders both on-time AND in-full | P2 |
| S-10 | Cancellation rate | Cancelled ÷ total sub-orders | P1 |
| S-11 | Lead-time trend | S-6 this period vs previous period, with ▲▼ indicator | P2 |
| S-12 | Products currently OOS | Count of this supplier's products with OOS flag on now, + longest current OOS duration | P1 |
| S-13 | Avg days to restock | Mean of (OOS off `toggled_at` − OOS on `toggled_at`) per OOS episode in period | P2 |
| S-14 | Waitlist demand | Sum of open Notify Me subscriptions on this supplier's products; also as estimated AED (subs × product price) | P1 |

### 2.3 Client relationship table (account management view)

One row per client. **This is the "who do I call this week" view.** Drill-down shows order history, top products, carts/wishlists.

| # | Metric | Definition / formula | Priority |
|---|---|---|---|
| C-1 | Total spend (AED) | Lifetime and period GMV ex-VAT | P1 |
| C-2 | Orders (lifetime / period) | Counts | P1 |
| C-3 | Last order date | Max `placed_at`; show as "X days ago" | P1 |
| C-4 | **Order cadence** | Median days between consecutive parent orders (needs ≥3 orders; otherwise blank) — or manual `expected_order_frequency_days` if set | P1 |
| C-5 | **Reorder overdue flag** | TRUE when (today − last order date) > 1.5 × cadence. *The single most important signal in a reorder-first business.* | P1 |
| C-6 | Spend trend | Period spend vs previous equal period, ▲▼ % | P2 |
| C-7 | Top 5 products | By quantity, lifetime | P1 |
| C-8 | Open cart value | Value of items sitting in an abandoned cart now + days since last cart activity — *a personal follow-up prompt, not an email trigger* | P1 |
| C-9 | Wishlist items | Count + list on drill-down | P2 |
| C-10 | Open Notify Me subscriptions | Products this client is waiting on (talking point: "your gloves are back in") | P1 |
| C-11 | Account owner | From client config | P2 |

### 2.4 Demand & lost-sales signals

| # | Metric | Definition | Priority |
|---|---|---|---|
| D-1 | Notify Me leaderboard | Products ranked by open subscription count; columns: product, supplier, subs, est. AED demand, days OOS so far | P1 |
| D-2 | Zero-result searches | Log every storefront search (`term, results_count, client_id, at`); report terms with 0 results ranked by frequency in period — assortment gaps to source | P1 |
| D-3 | Abandoned cart total | Count + AED value of carts inactive > 48h in period | P1 |
| D-4 | Notify Me conversion | % of sent restock notifications where the client ordered the product within 14 days | P2 |
| D-5 | OOS lost-sales estimate | Per product: (units/day sold in 90 days before OOS) × days OOS × price — label clearly as an estimate | P2 |

### 2.5 Action queues (homepage widgets — the daily to-do list)

| # | Queue | Rule | Priority |
|---|---|---|---|
| Q-1 | Unacknowledged orders | Sub-orders where `acknowledged_at` is null and (now − `placed_at`) > supplier's `ack_sla_hours` — show supplier phone/email inline for a chase call | P1 |
| Q-2 | Overdue deliveries | Sub-orders not delivered and (now − `placed_at`) > `promised_lead_time_days` | P1 |
| Q-3 | Clients overdue to reorder | All clients where C-5 flag is TRUE, sorted by lifetime spend descending | P1 |
| Q-4 | Long-running OOS | Products OOS > 14 days with ≥1 Notify Me subscription | P1 |
| Q-5 | Idle carts worth chasing | Carts > AED 500 inactive 2–7 days | P2 |

---

## 3. SUPPLIER PORTAL (what each supplier sees about themselves)

Suppliers see **only their own data**. Framing is supportive ("your performance"), never comparative league tables — comparisons stay in the admin panel and in the admin's meetings.

| # | Metric / element | Definition | Priority |
|---|---|---|---|
| SP-1 | Open orders queue | Their sub-orders not yet delivered, each showing status, time since placed, and a visible target ("acknowledge within 24h / deliver within N days") with amber/red ageing colours | P1 |
| SP-2 | Sales this period (AED) | Their GMV ex-VAT + sub-order count, period selector | P1 |
| SP-3 | My fulfilment times | Their own S-3, S-4, S-6 (median, this period vs last) | P1 |
| SP-4 | My on-time rate | Their S-7 vs their promised lead time | P1 |
| SP-5 | Top sellers | Their top 10 products by units in period | P1 |
| SP-6 | My out-of-stock list | Their products currently flagged OOS, each showing **waiting-client count** ("14 clinics waiting") — the restock nudge that needs no automation | P1 |
| SP-7 | Cancellations | Count + rate in period | P2 |
| SP-8 | Statements | List of their invoices/settlements with amounts and payment status (build once the payment/commission flow is finalised) | P2 |

**New portal action required:** "Acknowledge order" button (sets `acknowledged_at`). "Mark dispatched" and "Mark delivered" if not already present.

---

## 4. CLIENT DASHBOARD (what each buyer/clinic sees)

Reorder-first: the client's home screen is built around getting them to their next order in two clicks.

| # | Metric / element | Definition | Priority |
|---|---|---|---|
| CL-1 | **Buy again** | Grid of products from their past orders, sorted by purchase frequency, each with qty stepper + add-to-cart; "Reorder entire last order" button at top | P1 |
| CL-2 | Order tracker | Their recent orders (by reference number) with per-supplier shipment status and expected delivery date (`placed_at` + supplier `promised_lead_time_days`) | P1 |
| CL-3 | Due for reorder | Products they buy on a cadence where (today − last purchase) ≥ cadence — "You usually order these every ~21 days" (rule-based from their own history, min 3 prior purchases) | P1 |
| CL-4 | Spend summary | This month / last 3 months spend (AED ex-VAT and VAT shown separately), spend by category — genuinely useful for clinic budgeting | P2 |
| CL-5 | My waitlist | Their Notify Me subscriptions with current status (still out / back in stock → add to cart) | P1 |
| CL-6 | Saved lists / wishlist | Existing feature, surfaced on dashboard | P2 |
| CL-7 | Invoices & statements | Downloadable invoices per order reference; monthly statement | P1 |

---

## 5. Implementation notes for Claude Code

1. **Build order:** Section 1 (data model + status log + timestamps + supplier config) → 2.5 action queues + 2.2 supplier table → 3 supplier portal → 2.3 client table → 4 client dashboard → everything P2.
2. **Sub-order model:** if sub-orders don't exist as first-class records yet (i.e., splitting is only visual), create a `supplier_sub_order` entity now — every metric above depends on it.
3. **Backfill:** compute metrics from the go-live date of timestamp logging; don't fake historical values. Show "insufficient data" below 5 sub-orders / 3 client orders rather than misleading percentages.
4. **Charts:** simple line (trend over time) + table. No dashboards-of-dashboards. Every table exports to Excel (the team runs weekly meetings from Excel).
5. **Permissions:** supplier portal queries must be hard-scoped to `supplier_id` server-side (note: supplier permission bypass has been a recurring bug — treat scoping as a test case, not an assumption).
6. **Timezone & locale:** all timestamps stored UTC, displayed Asia/Dubai. AED formatted in English throughout.
7. **No automated emails or penalties from any metric in this spec.** Queues and flags surface work for humans; the Notify Me restock email remains the only automated client-facing message.

---

## 6. Suggested acceptance-test additions (Master Testing Checklist)

- Status log writes an immutable row per transition; timestamps never overwrite (ADM-ORD)
- Acknowledge button sets `acknowledged_at` once; re-clicks don't update it (SUP)
- Lead-time metrics exclude cancelled sub-orders (ADM-RPT)
- Supplier portal metrics return zero rows for another supplier's ID (SEC)
- OOS toggle log records both on and off events with actor (ADM-PRD)
- Reorder-overdue flag fires at 1.5 × cadence, not before (ADM-CUS)
- Export-to-Excel matches on-screen values for each table (ADM-RPT)
