# Assignment 09 — Business analytics & decision-grade reports

Read `00-PROJECT-CONTEXT.md` first. Requires 01–08 merged (builds on the 07 reports foundation).

## Goal

The fleet owner makes **staffing, pricing and growth decisions from data**, not gut feeling:
when to put more drivers on the street, which zones and routes earn money, which drivers to
coach or reward, whether customers come back — and the platform operator (SuperAdmin) sees
which tenants are growing, dying, or costing money. Assignment 07 answered "what happened";
this assignment answers "what should I do".

## Scope

**In:** analytics API (`/api/v1/analytics/*`, SQL-aggregated, percentile-based), fleet
executive dashboard, demand/capacity analytics, SLA & funnel analytics, revenue analytics,
driver league table & retention, customer repeat/cohort analytics, cross-tenant SuperAdmin
platform dashboard, Chart.js visualisations, CSV export everywhere, print-friendly monthly
summary, weekly Web-Push KPI digest.
**Out:** forecasting/ML, external BI or data warehouse, e-mail delivery, server-side PDF
rendering, realtime streaming analytics (all dashboards are on-demand queries), accounting.

## Analytics foundations (backend, applies to every endpoint here)

- New vertical slice `Features/Analytics/` (FleetAdmin) + `Features/Admin/` additions
  (SuperAdmin). Do **not** modify the existing `/reports/*` endpoints — 07 stays as-is.
- **SQL aggregation only** — `SqlQuery`/LINQ-translated `GroupBy`; never load raw orders and
  group in memory. The UC-007 patterns are binding: snake_case result aliases, Prague-local
  day bucketing via `(created_at AT TIME ZONE 'Europe/Prague')::date`.
- **Percentiles, not just averages**: SLA metrics report p50 **and** p90 via
  `percentile_cont` — tail latency is what loses customers.
- Common query contract for all fleet endpoints: `from`, `to` (default: this month),
  `granularity` = `day | week | month`, and `compare=true` → the same aggregates for the
  immediately preceding period of equal length (for delta badges).
- Money stays integer CZK; day/week/month buckets are Europe/Prague local.
- Add the composite indexes the queries need (e.g. `(fleet_id, status, created_at)`,
  `(fleet_id, driver_id, completed_at)`) — review generated SQL.
- Perf budget: every analytics endpoint **< 500 ms against the 50 000-order seeded dataset**
  (reuse the 07 seeding script; extend it with ratings/shifts/events spread if needed).

## 1. Executive overview (`GET /api/v1/analytics/overview`)

KPI cards, each with value + delta vs previous period: rides completed, gross revenue,
average order value, fulfillment rate (completed / created), cancellation rate, active
customers, **new** customers, active drivers, online driver-hours, revenue per online hour,
average rating. Plus a compact rides+revenue trend series for sparklines.

## 2. Demand & capacity (`GET /api/v1/analytics/demand`) — the scaling report

- **Demand heatmap**: order count by hour-of-day × day-of-week (Prague local) over the range.
- **Supply vs demand per hour bucket**: orders created vs distinct online driver-hours
  (from `driver_shifts`, clipped to the bucket), and fulfillment rate per bucket — shows
  exactly which shifts are understaffed.
- **Unmet demand**: cancellations where no driver ever accepted (cancelled while `New`/
  `Assigned`, incl. `Timeout` events) by hour bucket.
- **Utilization**: busy time (accept→complete from order timestamps) as share of online time,
  fleet-wide and per driver — the "do I need more cars or better dispatch?" number.
- **Zone & route demand**: pickups per zone (point-in-polygon vs `zones`), top routes by count.

## 3. Operations & SLA (`GET /api/v1/analytics/operations`)

- **SLA trends** (p50/p90 series per bucket): time-to-assign (created→assigned),
  time-to-accept (assigned→accepted), time-to-pickup (accepted→arrived), ride duration
  (started→completed). From `orders` denormalized timestamps.
- **Offer funnel** (from `order_events`): offers made (`Assigned` + `Reassigned`), accepted,
  declined, timed out; average offers per completed ride.
- **Lifecycle funnel**: created → assigned → accepted → arrived → in-progress → completed
  conversion counts for the range.
- **Cancellation breakdown**: by `CancelledByRole`, by status-at-cancellation, by hour of day;
  no-show share (cancelled after `Arrived`).

## 4. Revenue (`GET /api/v1/analytics/revenue`)

- Revenue series per bucket, **stacked by payment type** (cash/card/invoice) and split by
  `OrderSource` (Phone/App/Dispatcher) and `PriceType` (fixed-route vs metered).
- Average order value trend; price-override impact: count, total CZK delta
  (`FinalPriceCzk` vs `FixedPriceCzk`/`EstimatedPriceCzk`), top override reasons.
- **Route & zone economics**: top N routes and pickup zones by revenue, rides, and average
  value — where to add fixed routes or adjust tariffs.
- SMS cost line (from notification log) so the owner sees channel cost next to revenue.

## 5. Drivers (`GET /api/v1/analytics/drivers` + `GET /api/v1/analytics/drivers/{id}`)

- **League table** over the range, sortable, CSV-exportable: rides completed, revenue, online
  hours, utilization %, revenue/online-hour, acceptance rate, avg time-to-accept,
  declines + timeouts, cancellations, no-shows, average rating.
- **Driver drill-down**: weekly trend of rides/revenue/rating for one driver + their recent
  low-rated (≤3) orders — the coaching view.
- **Driver retention**: per week — active drivers (≥1 completed ride), newly activated
  (first ride ever in that week), churned (previously active, no completed ride in the last
  14 days as of that week).

## 6. Customers (`GET /api/v1/analytics/customers`)

- **New vs returning** rides per bucket (returning = customer identity with a prior completed
  ride; identity = `CustomerUserId`, else normalized `CustomerPhone`).
- **Repeat rate & frequency distribution**: customers with 1 / 2–5 / 6+ rides in the range.
- **Monthly cohort retention triangle** (up to 6 columns): acquisition month × share of the
  cohort active in month +1…+5. Small numbers are fine — the shape is the decision input.
- **Top customers** by rides and revenue (name/phone masked to the same format the dispatcher
  board already uses).
- **Ratings analysis**: distribution 1–5, average trend per bucket, and the worst-rated
  orders list (order code, driver, comment) for complaint follow-up.
- **GDPR interaction**: anonymized orders (`+420000000000`) count toward volumes/revenue but
  are **excluded** from customer-identity metrics (new/returning, cohorts, top customers).

## 7. SuperAdmin platform dashboard (`GET /api/v1/admin/analytics`)

Cross-tenant by design — `SuperAdminOnly`, `IgnoreQueryFilters()` documented at the query
site. Per fleet: rides + revenue this month and last (MoM delta), active drivers, active
customers, SMS messages + estimated cost, last order timestamp, 12-week rides sparkline, and
a rule-based health flag: `growing` (MoM ≥ +10 %), `stable`, `declining` (≤ −10 %),
`inactive` (no order in 14 days). Platform totals row. This is the "which tenant do I call
this week" screen.

## 8. Frontend (`/x/analytics` + `/admin`)

- New nav item **Analytika** (`/x/analytics`, FleetAdmin-only) — its own lazy chunk; existing
  `/x/reports` stays untouched. Tabs: **Přehled** (overview), **Poptávka** (demand),
  **Provoz** (operations/SLA), **Tržby** (revenue), **Řidiči** (drivers), **Zákazníci**
  (customers).
- Shared controls on every tab: date-range presets (dnes / 7 dní / tento měsíc / minulý
  měsíc / kvartál / rok / vlastní), granularity switch, comparison toggle (delta badges).
- **Charts: Chart.js 4 + react-chartjs-2** (decision 2026-09-13 — supersedes the plain-SVG
  guidance from 07 for this feature only). Register only needed controllers (tree-shaken).
  Loaded **only** inside the lazy analytics chunks — `/d`, `/c`, and the eager `/x` board
  chunk budgets must not change; add a new analytics-chunk size-limit budget +
  `docs/decisions.md` entry. Chart types: line/area (trends), stacked bar (revenue splits),
  matrix-style heatmap (demand), horizontal bar (league/top-N), doughnut (shares), funnel as
  horizontal bars. Chart *data/config builders are pure tested modules*; chart components are
  mocked in jsdom (canvas doesn't render there); a11y: every chart has a data-table fallback
  or aria description.
- **CSV export on every tabular view** (league table, top routes/zones, top customers,
  cohorts, worst-rated orders) — UTF-8 BOM + `;`, reuse `csvDownload`.
- **Print-friendly monthly summary**: the Overview tab has a print stylesheet (nav/controls
  hidden, charts + KPI cards laid out for A4) so the owner can print / save-as-PDF.
- `/admin` gains a **Platform** analytics screen (the §7 table + sparklines) next to the
  fleet list.

## 9. Weekly push digest

- `WeeklyDigestJob` (RunTickAsync-shell background job): every Monday 06:00 Europe/Prague,
  for each active fleet compute last ISO week vs the week before (rides, revenue, delta %,
  avg rating, top driver by rides) and send a Web Push via the existing `IPushSender` to that
  fleet's FleetAdmin users. Czech text, no PII beyond the top driver's first name.
- **Idempotent per (fleet, ISO week)** — persist a sent marker; restarts or overlapping ticks
  must not double-send. Fleets with zero rides in both weeks are skipped.

## Acceptance criteria

1. Every analytics endpoint is SQL-aggregated (no in-memory grouping of raw orders) and its
   numbers match a **hand-computed fixture dataset** in integration tests (the fixture covers:
   cancellations at different stages, a declined+reassigned order, a price override, an
   anonymized customer, two drivers, orders spanning a week boundary in Prague time).
2. p50/p90 SLA metrics match hand-computed values on the fixture (odd + even counts).
3. Every fleet analytics endpoint responds **< 500 ms** with the 50 000-order seed; measured
   numbers recorded in the handoff/DEMO notes.
4. Tenant isolation test per endpoint (fleet A cannot read fleet B); `/admin/analytics`
   returns 403 for FleetAdmin and full cross-tenant data for SuperAdmin.
5. Anonymized customers appear in volume/revenue metrics but never in new/returning, cohort,
   or top-customer outputs (explicit test).
6. Bundle: `/d`, `/c`, and eager `/x` budgets unchanged; Chart.js lives only in the lazy
   analytics chunks; new chunk budget passes `npm run size` and is recorded in
   `docs/decisions.md`.
7. League-table CSV is byte-tested (BOM + `;`); cohort and heatmap CSVs open in Czech Excel.
8. Weekly digest: same ISO week processed twice → exactly one push per fleet (idempotency
   test); digest numbers match the overview endpoint for the same week; zero-activity fleets
   skipped.
9. Playwright: FleetAdmin opens `/x/analytics`, switches tab and date range, sees populated
   KPI cards + a chart + a table from seeded data; SuperAdmin sees the platform table.
10. Lighthouse a11y ≥ 90 on `/x/analytics` (charts have accessible fallbacks).
