# Assignment 07 — Reports, audit view & tenant onboarding

Read `00-PROJECT-CONTEXT.md` first. Requires 01–06 merged.

## Goal

The owner sees how the business is doing, the dispatcher can answer any complaint, and we can
onboard a second fleet in 10 minutes without touching the server.

## Scope

**In:** driver daily/monthly reports, fleet reports, CSV export, audit views, SuperAdmin fleet creation,
fleet self-service settings, data retention, GDPR basics.
**Out:** accounting integration, invoicing, BI dashboards.

## Reports (`/x/reports`, FleetAdmin; drivers see only their own in `/d/history`)

### 1. Driver report
- Filters: driver, date range (default: this month).
- Per day rows: rides completed, cancelled (no-show), cash total, card total, invoice total, total, hours online (from `driver_shifts`), rides with price override (count).
- Totals row. CSV export (UTF-8 with BOM, `;` separator — Czech Excel).
- Backend: `GET /api/v1/reports/drivers?driverId&from&to` with SQL aggregation (no in-memory grouping of raw orders).

### 2. Fleet report
- Same range. KPIs at top: rides, revenue, average price, average time to assign (created→assigned), average time to pickup (accepted→arrived), cancellation rate, share of app orders vs phone orders, fixed-route share, SMS count and estimated cost.
- Chart: rides per day (simple bar; use a tiny chart lib or plain SVG — no heavy dependency).
- Top common routes by count.
- Backend: `GET /api/v1/reports/fleet?from&to`.

### 3. Ratings
- List of ratings with comment, order code, driver. Average per driver in the driver report.

## Audit

- `/x/audit` (FleetAdmin): unified timeline of `order_events` + `audit_log`, filterable by actor, entity, date, order code. Read-only. Backend `GET /api/v1/audit?...` paged.
- Order detail timeline (02) must show every event type with a Czech label, including price overrides and manual status overrides.

## Tenant onboarding

### 1. SuperAdmin
- Endpoints `/api/v1/admin/fleets`: create (`slug, name, phone, adminEmail` → returns one-time admin password), list, deactivate. Protected by `SuperAdminOnly`; SuperAdmin user is created by a CLI command `dotnet run -- create-superadmin --email --password` (no UI needed).
- Creating a fleet also creates: `FleetSettings` defaults, default Tariff, empty zones/routes, the FleetAdmin user.
- A minimal `/admin` page (list fleets, create fleet form) — 1 screen, no design effort.

### 2. Fleet self-service (`/x/settings` → "Fleet")
- Name, phone, logo (upload ≤ 200 KB, stored on disk under `/data/fleets/{id}/logo.png`, served by Caddy), primary color (hex, used by customer PWA theme), welcome text, offer timeout, SMS cap, auto-dispatch toggle (still v1.1-disabled).
- Customer PWA reads these via `GET /public/fleet` and applies name/color/logo at runtime (no rebuild per tenant — verify with two seeded fleets on two subdomains locally: `demo.localhost`, `second.localhost`).

### 3. Subdomain routing
- Caddy config: wildcard `*.{domain}` → web; API resolves tenant from `Host`. Document DNS setup in `docs/runbook.md`.

## Data retention & GDPR

- Job `RetentionJob` (daily): anonymize customer phone/name on orders older than 24 months (`+420000000000`, "Anonymizováno"); delete `sms_codes` older than 1 day; delete `refresh_tokens` expired > 30 days; delete driver positions older than 7 days if position history is ever added (not in v1 — note in decisions).
- `DELETE /api/v1/customers/me` — customer can request deletion: anonymizes their orders and deletes the user. Confirm via SMS code.
- `docs/gdpr.md`: what is stored, why, for how long, in Czech and English, suitable to link from the customer app footer ("Ochrana osobních údajů").

## Acceptance criteria

1. Driver report for the seeded data matches a hand-computed expected table (put the expected CSV in tests).
2. Fleet KPIs computed in SQL; endpoint responds < 300 ms with 50 000 seeded orders (add a seeding script).
3. Creating a fleet via SuperAdmin, logging in as its admin, adding a driver, and creating an order works end-to-end in a Playwright test using a second subdomain.
4. Second fleet's customer app shows its own name and color without any rebuild.
5. Retention job anonymizes a 25-month-old order and leaves a 23-month-old one intact.
6. Customer self-deletion works and their past orders remain in reports (anonymized).
7. CSV opens correctly in Czech Excel (BOM + `;`), verified by test on bytes.
