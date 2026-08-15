@AGENTS.md

## Dashboard Metrics Specification — an idea source, not an authority

`docs/DASHBOARD_METRICS_SPEC.md` sets out dashboards, order-lifecycle timestamps,
supplier performance tracking, client reorder signals and action queues.

**Read it when planning anything in that territory. Do not follow it literally.**
It was written without sight of this codebase, so parts of it describe work that
is already done and parts assume a data model we do not have. `docs/issue-register.csv`
remains the source of truth for what is actually outstanding; reconcile the spec
against the register and `prisma/schema.prisma` before planning from it, and add
anything genuinely missing to the register rather than working from the spec alone.

Known corrections, so nobody re-derives them:

- **Supplier sub-orders already exist.** Section 5.2 says to create a
  `supplier_sub_order` entity. `OrderSupplierInvoice` is that entity, with a
  `UNIQUE(orderId, supplierId)` constraint. Do not build a parallel one.
- **Some of Section 1.1 is built.** Orders carry delivery type, estimated
  shipment date, courier, tracking number, payment status and dates; order lines
  carry their own fulfilment status and batch/expiry snapshots. What is missing
  is the per-sub-order `acknowledged_at` / `dispatched_at` / `delivered_at`
  timestamps and the immutable status log.
- **`AuditLog` already records every admin write** with actor, before and after.
  The proposed `order_status_log` should complement it, not duplicate it.
- **Notify Me is keyed on email, not client** (`NotifySubscription`), and
  FN-04 records that it does not yet register a subscription at all. Section 1.5
  and every Notify Me metric depend on FN-04 being done first.
- **Metric priorities in the spec are not our priorities.** Its P1s are not the
  register's P1s, and it is silent on the launch blockers (AC-01 to AC-04,
  DA-03, SEC-01, LG-01, LG-02).

What the spec gets right and should be kept:

- The design principle: AussieMed is relationship-led and manually operated.
  Metrics produce visibility and action queues for humans — never automated
  emails, automated penalties, or automated supplier ranking. The Notify Me
  restock email is the only automated client-facing message.
- Compute fulfilment metrics per supplier sub-order, never at parent-order level.
- Report median and P90 for durations, not just averages.
- Show "insufficient data" rather than a percentage derived from three orders.
- Platform conventions: AED in English, VAT 5% shown separately, "reference
  number" (never "order number"), timestamps stored UTC and displayed Asia/Dubai.

This is a pointer, deliberately not an `@import` — the spec is long and should be
read on demand for relevant work, not loaded into context every session.
