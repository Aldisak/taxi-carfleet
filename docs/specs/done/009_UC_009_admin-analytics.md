# UC-009 — Business analytics & decision-grade reports

- **Sequence:** 009
- **Stack:** mixed — backend-heavy (`/api`: `Features/Analytics/` slice with 6 fleet endpoints + `/admin/analytics` cross-tenant, percentile SQL, composite indexes, WeeklyDigestJob) + frontend (`/web`: new lazy `/x/analytics` section with 6 tabs, Chart.js 4, CSV everywhere, print stylesheet, `/admin` Platform screen)
- **Complexity tag:** moderate (patterns proven in UC-007 — SqlQuery snake_case aliases, Prague-time bucketing, 50k-order perf tests, CSV byte-exactness, RunTickAsync jobs, lazy chunks — but new in variety: `percentile_cont`, heatmap bucketing, cohorts, comparison periods, first chart-library dependency)
- **Mode:** *(set at Gate A — autonomous batch vs gated)*
- **Sources of truth:** `.claude/state/00-PROJECT-CONTEXT.md` (§6 conventions, §7 multi-tenancy, §12 DoD), `.claude/state/09-admin-analytics.md` (**authoritative — all report definitions, metric formulas, ACs live there; do not restate**), `docs/api.md`, `docs/decisions.md`, CLAUDE.md facts (esp. `SqlQuery` snake_case mapping, `AT TIME ZONE` translation, jsonb projection trap).

## Title

The fleet owner decides staffing, pricing and growth from data; the platform operator spots growing/dying tenants: a full analytics suite (overview KPIs with period deltas, demand heatmap + supply/demand per hour, p50/p90 SLA + offer/lifecycle funnels, revenue splits + route/zone economics, driver league table + retention, customer repeat/cohort analytics), a cross-tenant SuperAdmin platform dashboard, Chart.js dashboards with CSV export + print-friendly monthly summary, and a weekly Web-Push KPI digest.

## Actors

- **FleetAdmin / Owner** — `/x/analytics` (6 tabs), CSV exports, print summary, weekly push digest recipient.
- **SuperAdmin** — `/admin` Platform screen + `GET /api/v1/admin/analytics` (cross-tenant, the one intentional `IgnoreQueryFilters` read).
- **System** — `WeeklyDigestJob` (Monday 06:00 Europe/Prague, idempotent per fleet+ISO-week, via existing `IPushSender`).
- **Dispatcher / Driver / Customer** — no surface changes (nav item is FleetAdmin-gated).

## Preconditions

- UC-001..008 shipped (main @ `5d01133`): backend 493 tests, web 1097 unit + 12 e2e. Verify against SOURCE: `Order` denormalized lifecycle timestamps (`AssignedAt`/`AcceptedAt`/`ArrivedAt`/`StartedAt`/`CompletedAt`/`CancelledAt` + `CancelledByRole`, `CancelReason`, `RatingStars`, `Source`, `PriceType`, `PaymentType`, `FinalPriceCzk`) — SLA/cancellation/revenue metrics come from `orders`; `order_events` (`Assigned`/`Reassigned`/`Declined`/`Timeout`) — offer funnel only; `driver_shifts` (online hours); `zones` polygons + `routes`; notification log (SMS cost); UC-007's 50k seeding script, `csvDownload`, `reportDateRange`, `RunTickAsync` job shell, `IPushSender`, SuperAdmin policy, `/admin` screens.

## Main flow (system level)

**Lane A — backend (`api/`, the bulk):** `Features/Analytics/` slice — six FleetAdmin endpoints (`overview`, `demand`, `operations`, `revenue`, `drivers` [+ `drivers/{id}` drill-down], `customers`) sharing the `from/to/granularity/compare` query contract, all SQL-aggregated with `percentile_cont` for SLA p50/p90 and Prague-local bucketing; `GET /api/v1/admin/analytics` (SuperAdminOnly, cross-tenant per-fleet health table); composite indexes + migration; `WeeklyDigestJob` with persisted (fleet, ISO-week) sent marker; extend the 50k seeder with realistic ratings/shifts/events spread if gaps found. Full metric definitions: assignment §§1–7, 9.

**Lane B — frontend (`web/`):** new lazy `/x/analytics` route group (nav **Analytika**, FleetAdmin-gated) with 6 tabs + shared range/granularity/compare controls; Chart.js 4 + react-chartjs-2 registered per-controller inside the analytics chunk only (pure tested config-builder modules, charts mocked in jsdom, data-table/aria fallback per chart); CSV on every table; Overview print stylesheet (A4); `/admin` Platform screen. Full spec: assignment §8.

## Acceptance criteria

The 10 in `.claude/state/09-admin-analytics.md` are binding: (1) SQL-aggregated + hand-computed fixture match; (2) p50/p90 hand-verified; (3) < 500 ms @ 50k orders, measured; (4) tenant isolation per endpoint + 403/cross-tenant contract on `/admin/analytics`; (5) anonymized customers excluded from identity metrics only; (6) bundle budgets — Chart.js confined to lazy analytics chunks, decisions.md entry; (7) CSV byte-tested; (8) digest idempotent per ISO week + numbers match overview; (9) Playwright fleet-admin + superadmin flow; (10) Lighthouse a11y ≥ 90.

## Out of scope

Forecasting/ML, external BI/warehouse, e-mail, server-side PDF, realtime streaming analytics, accounting; no changes to existing `/reports/*` endpoints or the UC-007 screens.

## Non-functional requirements

- Multi-tenancy: every fleet endpoint tenant-scoped via query filters + isolation test; `/admin/analytics` is the documented cross-tenant read (`IgnoreQueryFilters` at the query site, SuperAdminOnly).
- Conventions: `.claude/rules` throughout; money integer CZK; buckets Europe/Prague; Czech-first UI (both locale files per key); no PII in logs (digest logs fleet id + counts only).
- Perf: < 500 ms per endpoint @ 50k seed (blocking test, UC-007 AC#2 precedent); no N+1; review index SQL.
- Quality gate (blocking): api build `-warnaserror` + test; web lint + tsc + test + build + size (new analytics-chunk budget) + Playwright AC#9. Informational: format.

## Notes for the designer

- Split Lane A/Lane B WIs with `lane` + `depends_on`; serialize the migration WI (index/digest-marker table) first in lane A (one coherent snapshot, UC-004..006 precedent). The `percentile_cont` + heatmap + cohort SQL shapes are the risk — spike their translations early against the `TranslationSpikeTests` precedent (CLAUDE.md UC-007 A2: snake_case aliases, `AT TIME ZONE` raw SQL, `.Concat()` translates).
- Chart.js is the first chart dependency: one WI must own the size-limit budget + decisions.md entry + jsdom mocking pattern before the tab WIs consume it.
- Digest job: reuse the WI-14 job patterns (RunTickAsync, per-fleet scopes, `IgnoreQueryFilters` scan then per-fleet tenant scope); idempotency marker is a small table, not in-memory.
- Zone attribution (pickups per zone) — check how UC-006 does point-in-polygon (reuse, don't reinvent); if it's app-side only, top-zones may need NetTopologySuite or a bounding-box SQL approximation — designer decides and documents.
- Carry forward: client.ts named-envelope unwrap; `reportDateRange` presets extend (kvartál/rok); league-table CSV via `csvDownload`; masked customer identity format from the board.
