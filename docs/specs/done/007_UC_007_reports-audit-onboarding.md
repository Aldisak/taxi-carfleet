# UC-007 — Reports, audit view & tenant onboarding

- **Sequence:** 007
- **Stack:** mixed — backend-heavy (`/api`: SQL-aggregated reports, CSV, audit query, SuperAdmin fleet CRUD + CLI, fleet self-service, logo upload, RetentionJob, GDPR self-deletion) + frontend (`/web`: `/x/reports`, `/x/audit`, minimal `/admin`, `/x/settings` Fleet tab)
- **Complexity tag:** novel (SQL aggregation with a 50k-order perf budget <300ms, CSV UTF-8-BOM + `;` byte-exact for Czech Excel, new SuperAdmin role + CLI bootstrap, multi-subdomain tenant resolution, logo upload/serve, retention anonymization + GDPR self-deletion, audit timeline merge of order_events + audit_log)
- **Mode:** autonomous batch run (standing user directive renewed 2026-09-12: gates A–E pre-approved, parallel lanes, backend-developer (api) / frontend-developer (web) agents, interrupt only on 3-round blocks / quality-gate failures / undecidable scope. No git remote → ship = local commit on a feature branch. LESSON: long subagents hit stream-idle timeouts; conductor runs the e2e harness itself and verifies design when the reviewer subagent times out; keep agent scopes bounded.)
- **Sources of truth:** `.claude/state/00-PROJECT-CONTEXT.md` (§4 stack, §6 conventions, §7 multi-tenancy, §12 DoD), `.claude/state/07-reports-audit-tenant-onboarding.md` (reports/audit/onboarding/retention/GDPR/ACs — authoritative, do not restate), `docs/api.md`, `docs/decisions.md`, CLAUDE.md facts.

## Title

The owner sees how the business is doing, the dispatcher can answer any complaint, and a second fleet onboards in 10 minutes without touching the server: driver + fleet reports (SQL aggregation, Czech-Excel CSV), a unified read-only audit timeline, SuperAdmin fleet creation (CLI-bootstrapped) + fleet self-service settings with per-tenant branding, subdomain tenant routing, and data-retention + GDPR basics.

## Actors

- **FleetAdmin / Owner** — `/x/reports` (driver + fleet reports, ratings, CSV), `/x/audit`, `/x/settings` Fleet self-service.
- **Dispatcher** — audit timeline to answer complaints; order-detail timeline with Czech event labels.
- **Driver** — own reports only (already in `/d/history`, UC-003 — verify the override count + ratings surface).
- **SuperAdmin** — `/admin` + `/api/v1/admin/fleets` (create/list/deactivate); bootstrapped by a `dotnet run -- create-superadmin` CLI command.
- **Customer** — GDPR self-deletion (`DELETE /api/v1/customers/me`, SMS-code-confirmed); sees their fleet's branding.
- **System** — daily `RetentionJob` (anonymize old orders, prune sms_codes/refresh_tokens).

## Preconditions

- UC-001..006 shipped (commit `019c595`): backend 420 tests, web 1005 unit + 10 e2e. Reuse/verify against SOURCE (do not assume): `order_events` + `audit_log` (CLAUDE.md: AuditLog.Diff jsonb) entities + how audit rows are written today; `driver_shifts` (hours online, UC-003 A-me summed shifts); `UserRole` enum (add `SuperAdmin`; note enums stored as strings → no migration for a new member per CLAUDE.md WI-07) + the authorization policies pattern; `Fleet`/`FleetSettings`/`Tariff` (fleet-creation defaults + self-service fields incl. `PrimaryColorHex` from UC-006) + `GET public/fleet` (UC-004, add logo/welcome/color if missing); the background-job `RunTickAsync` shell pattern (UC-003 WI-14, UC-005); the tenant-resolution-by-Host/slug middleware (UC-004); `SmsCode` (GDPR deletion confirm); the program CLI entrypoint (for `create-superadmin`).

## Main flow (system level)

**Lane A — backend (api/, the bulk):**
1. **Driver report**: `GET /api/v1/reports/drivers?driverId&from&to` (FleetAdmin) — SQL aggregation (NO in-memory grouping of raw orders): per-day rides completed/cancelled(no-show)/cash/card/invoice/total CZK, hours online (driver_shifts), price-override count; totals row; avg rating per driver. CSV export variant (UTF-8 **with BOM**, `;` separator) byte-tested.
2. **Fleet report**: `GET /api/v1/reports/fleet?from&to` (FleetAdmin) — SQL KPIs: rides, revenue, avg price, avg time-to-assign (created→assigned), avg time-to-pickup (accepted→arrived), cancellation rate, app-vs-phone share, fixed-route share, SMS count + est cost; rides-per-day series (for a plain-SVG/tiny chart — no heavy dep); top common routes by count. Perf <300ms @ 50k seeded orders (+ a seeding script).
3. **Ratings**: list (comment, order code, driver) + per-driver average in the driver report.
4. **Audit**: `GET /api/v1/audit?actor&entity&from&to&orderCode&page` (FleetAdmin) — paged unified timeline merging `order_events` + `audit_log`, read-only, tenant-scoped. Order-detail timeline (UC-002) shows every event type with a Czech label incl. price/manual overrides (verify/extend).
5. **SuperAdmin onboarding**: `/api/v1/admin/fleets` create (`slug,name,phone,adminEmail` → one-time admin password) / list / deactivate, `SuperAdminOnly`; create also seeds FleetSettings defaults + default Tariff + empty zones/routes + the FleetAdmin user. CLI `dotnet run -- create-superadmin --email --password` (no UI).
6. **Fleet self-service**: `/x/settings` Fleet fields persisted (name, phone, logo ≤200 KB stored `/data/fleets/{id}/logo.png`, primary color hex, welcome text, offer timeout, SMS cap, auto-dispatch toggle [v1.1-disabled]); `GET public/fleet` returns name/color/logo/welcome for the customer PWA at runtime (no per-tenant rebuild).
7. **Retention + GDPR**: daily `RetentionJob` (RunTickAsync shell) — anonymize customer phone/name on orders >24 months (`+420000000000`/"Anonymizováno"), delete sms_codes >1 day, delete refresh_tokens expired >30 days (driver-position history note: not in v1). `DELETE /api/v1/customers/me` (SMS-code-confirmed) anonymizes the customer's orders + deletes the user (orders remain in reports, anonymized). `docs/gdpr.md` (cs + en).

**Lane B — frontend (web/):**
8. **`/x/reports`** (FleetAdmin): driver report (filters: driver, date range default this-month; per-day table + totals + CSV download), fleet report (KPI cards + rides-per-day bar chart [plain SVG / tiny lib] + top routes), ratings list.
9. **`/x/audit`** (FleetAdmin): paged filterable read-only timeline (actor, entity, date, order code). Order-detail timeline Czech labels for every event type (verify UC-002 drawer).
10. **`/admin`** (SuperAdmin): 1 screen — list fleets + create-fleet form (shows the one-time admin password). Minimal, no design effort.
11. **`/x/settings` Fleet tab**: the self-service form incl. logo upload + color picker + welcome text; customer PWA applies name/color/logo from `public/fleet` at runtime.
12. **Subdomain routing docs**: `docs/runbook.md` (Caddy wildcard `*.{domain}` → web; API resolves tenant from Host; DNS) — verify two seeded fleets on `demo.localhost` + `second.localhost` locally.

## Acceptance criteria

The 7 in `.claude/state/07-reports-audit-tenant-onboarding.md` are binding: (1) driver report matches a hand-computed expected CSV in tests; (2) fleet KPIs in SQL, <300ms @ 50k seeded orders (seeding script); (3) SuperAdmin create-fleet → login as its admin → add driver → create order end-to-end via Playwright on a second subdomain; (4) second fleet's customer app shows its own name/color with no rebuild; (5) RetentionJob anonymizes a 25-month-old order, leaves a 23-month-old intact; (6) customer self-deletion works + past orders remain (anonymized) in reports; (7) CSV opens in Czech Excel (BOM + `;`), byte-tested.

## Out of scope

Accounting integration, invoicing, BI dashboards. Assignment 08 (infra/CI-CD/Caddy deployment — this UC documents the Caddy/DNS config in runbook.md but the actual deploy is 08). Auto-dispatch stays v1.1-disabled.

## Non-functional requirements

- Multi-tenancy: reports/audit strictly fleet-scoped (SuperAdmin endpoints cross-fleet by design but `SuperAdminOnly`); per-feature tenant-isolation test; the 50k-order seeding must be fleet-scoped. SuperAdmin fleet-create is the one cross-tenant write — guard hard.
- Conventions: `.claude/rules` (api-design REPR, vertical slices, ef-core — **SQL aggregation via LINQ GroupBy translated to SQL, not ToList-then-group**; error-handling, validation, csharp-style, logging — audit/GDPR must not log PII beyond ids); CSV as a streamed byte-exact result; background job RunTickAsync shell + TimeProvider; web rules; chart with no heavy dependency; money integer CZK; times Europe/Prague.
- Quality gate (blocking): api build -warnaserror + test; web lint (--max-warnings 0) + tsc + test + build + size; playwright for AC#3 (second-subdomain onboarding flow) — the conductor runs the harness. Informational: format.

## Notes for the designer

- Split Lane A (api, the bulk) + Lane B (web) WIs with lane + depends_on, topologically ordered; keep slices atomic. The SQL-aggregation reports (perf AC#2) + the CSV byte-exactness (AC#7) + the SuperAdmin cross-tenant onboarding (AC#3, the one cross-fleet write — guard + test hard) are the novel risks — investigate order_events/audit_log, UserRole/policies, Fleet/FleetSettings/Tariff, the CLI entrypoint, and the tenant-by-Host middleware against SOURCE before designing. Decide the 50k seeding approach (a dev/test seeding script, not the demo seeder).
- Migrations: likely FleetSettings/Fleet new self-service columns (welcome text, logo path, auto-dispatch) + any audit index for the query; SuperAdmin is a UserRole enum member (string-stored → no migration). Serialize migration-adding WIs via depends_on (one coherent snapshot — UC-004/005/006 precedent).
- Carry forward: client.ts named-envelope unwrap (reports/audit list responses); anonymous public/fleet branding fleet-safe by slug; logo served by Caddy (infra) — the API just stores + exposes the path; CSV download in the browser (blob + filename); the chart must not bloat the bundle (plain SVG preferred). Resolve the UC-003 B3e-1 (DisconnectBanner→shared) opportunistically only if it reduces a cross-feature import the reports screens would otherwise add.
