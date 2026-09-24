# CarFleetApp

A **multi-tenant taxi fleet system** for small taxi companies. One .NET 10 API and one PostgreSQL database serve three role-based clients from a single React codebase — a **dispatcher** web app, a **driver** mobile PWA, and a **customer** mobile PWA — kept in sync in real time over a single SignalR hub. Multiple fleets (tenants) run on one deployment, isolated by `FleetId`; the product is designed to run on a single small VPS.

The UI ships in **six languages** (Czech default, plus English, Russian, Ukrainian, Filipino, German). All eleven planned use-cases (UC-001…UC-011) are complete and merged.

---

## Highlights

- **Dispatcher board** — live three-column board (orders · drivers · map), phone-order entry with address autocomplete and live price preview, order timeline, search, fleet settings.
- **Driver PWA** — installable mobile app: shift on/off, full-screen ride offers (accept/decline/timeout), the ride lifecycle, ~3 s position reporting, an offline queue that replays on reconnect.
- **Customer PWA** — installable mobile app: 3-tap common-route or custom-address order, phone-code login, live driver tracking, cancel, rating, and a "call us" fallback on every screen.
- **Notifications** — transactional-outbox engine for SMS + Web Push with a per-fleet monthly cost cap.
- **Zones, routes & pricing** — zone/route editor and a deterministic price quote (fixed routes → zone rules → routed estimate → meter).
- **Reports, audit & onboarding** — CSV reports, a unified audit timeline, SuperAdmin fleet provisioning and fleet self-service settings, GDPR retention/self-deletion.
- **Analytics** — fleet-owner dashboards (KPIs, demand, SLA percentiles, revenue, driver league, customer cohorts) and a cross-tenant platform view, with a weekly Web Push KPI digest.
- **Maps** — all geo (tiles, suggest, geocode, routing) runs on the **Mapy.com** REST API through the backend, with caching, per-fleet credit budgets, and graceful degradation.
- **Multilingual UI** — in-app language selector in all three clients; money and dates always render `cs-CZ` / `Europe/Prague` regardless of UI language.

---

## Architecture

```
 Dispatcher (/dispatcher)   Driver PWA (/driver)   Customer PWA (/customer)   SuperAdmin (/admin)
            \                       |                        /                       /
             \______________________|_______________________/_______________________/
                                    │  HTTPS / WebSocket
                              ┌─────▼─────┐   (production: TLS, routing, rate-limit)
                              │   Caddy   │
                              └─────┬─────┘
                    REST /api/v1    │    realtime /hubs/fleet
                              ┌─────▼─────────────────┐
                              │   .NET 10 API         │  FastEndpoints (vertical slices)
                              │   SignalR hub         │  EF Core 10, background jobs
                              │   OrderStateMachine   │  multi-tenant (FleetId filters)
                              └─────┬─────────────────┘
                              ┌─────▼─────┐
                              │ Postgres  │
                              └───────────┘
                     external: Mapy.com (geo) · SMS gateway · Web Push (VAPID)
```

- **Backend** — one ASP.NET Core service using **FastEndpoints** in a vertical-slice layout (`Features/<Area>/…`), shared logic in `Common/`, and the DbContext/entities/migrations in `Infrastructure/`. Every order status change goes through a single `OrderStateMachine`, which writes an `order_events` row and broadcasts `OrderChanged` on SignalR inside one transaction.
- **Frontend** — one React + Vite SPA/PWA. It serves three role-based clients under hard route-group boundaries (`/dispatcher`, `/driver`, `/customer`) plus a SuperAdmin surface (`/admin`). Server state lives in TanStack Query; realtime events patch the query cache in place.

---

## Tech stack

**Backend & data**

| Area | Choice |
|------|--------|
| Runtime / language | .NET 10, C# 14 |
| API | FastEndpoints 8.3 (REPR endpoints), FluentValidation |
| Data | EF Core 10 + Npgsql 10 (code-first migrations), PostgreSQL 16 |
| Realtime | SignalR (self-hosted `/hubs/fleet`) |
| Background work | `IHostedService` jobs (offer timeout, stale position, notification dispatch, retention, geo cache/budget) |
| Cross-cutting | Serilog (structured JSON), `Microsoft.Extensions.Http.Resilience`, ASP.NET DataProtection |
| Notifications | pluggable SMS sender, `WebPush` (VAPID) |
| Tests | xUnit + Testcontainers (real Postgres), FluentAssertions |

**Frontend & infra**

| Area | Choice |
|------|--------|
| UI | React 18, TypeScript (strict), Vite 5 |
| Styling | styled-components (theme tokens) |
| State | TanStack Query (server), Zustand (small client state) |
| i18n | i18next + react-i18next (6 locales) |
| Maps / charts | Leaflet + Mapy.com tiles, Chart.js 4 (lazy) |
| Realtime client | `@microsoft/signalr` |
| PWA / offline | vite-plugin-pwa (Workbox), IndexedDB (`idb`) |
| Tests | Vitest + Testing Library + vitest-axe, Playwright (e2e) |
| Infra | Docker + Docker Compose, Caddy (reverse proxy / TLS), GitHub Actions |

---

## Quick start (Docker)

**Prerequisites:** Docker Desktop running. Nothing else is required for this path.

From the repo root:

```bash
docker compose -f infra/docker-compose.dev.yml up
```

This starts Postgres, the API (which migrates and seeds the demo fleet on first boot), and the web dev server together. Then open:

- Dispatcher — <http://localhost:5173/dispatcher>
- Driver PWA — <http://localhost:5173/driver>
- Customer PWA — <http://localhost:5173/customer>

The web dev server (`:5173`) proxies `/api` and `/hubs` to the API (`:5249`). The API base path is `/api/v1`; health is at `/health/ready`; Swagger is at `/swagger` (Development only).

**Seeded demo logins** (fleet slug `demo`, all password `Demo1234!`):

| Email | Role | Use |
|-------|------|-----|
| `admin@demo.local` | FleetAdmin | dispatcher + settings, reports, analytics |
| `dispatcher@demo.local` | Dispatcher | the live board |
| `driver1@demo.local` (also `driver2`, `driver3`) | Driver | the driver PWA |

Sample orders `DEMO01`–`DEMO05` are seeded across the order lifecycle. For a guided click-through demo, see **[docs/DEVELOPER.md](docs/DEVELOPER.md)**.

---

## Hybrid / local dev (optional)

Run the backend and frontend directly for hot-reload.

**Prerequisites:** the **.NET 10 SDK**, **Node ≥ 20**, and Docker (for the database).

```bash
# 1) database only
docker compose -f infra/docker-compose.dev.yml up -d db

# 2) API (from repo root)
dotnet run --project api/src/Taxi.Api        # serves http://localhost:5249

# 3) web (in another terminal)
cd web
npm ci
npm run dev                                   # serves http://localhost:5173
```

> **Troubleshooting:** confirm `dotnet --version` reports a **10.x** SDK. If an older SDK (e.g. 9.x) is first on your `PATH`, the build fails with `NETSDK1045: … does not support targeting .NET 10.0`. The Playwright e2e harness pins the SDK path explicitly for this reason.

---

## Project structure

```
carfleetapp/
├── api/                     .NET 10 backend
│   ├── src/Taxi.Api/
│   │   ├── Features/        vertical slices (Orders, Geo, Analytics, Auth, Admin, …)
│   │   ├── Common/          shared logic (OrderStateMachine, tenancy, geo helpers, notifications)
│   │   ├── Infrastructure/  DbContext, entities, migrations, background jobs
│   │   ├── Realtime/        SignalR FleetHub
│   │   └── Program.cs
│   └── tests/Taxi.Api.Tests/  xUnit + Testcontainers integration tests
├── web/                     React + Vite SPA/PWA
│   └── src/
│       ├── app/             router, providers, layouts
│       ├── features/        board, driver, customer, analytics, settings, …
│       └── shared/          api client, i18n (locale JSON), map, realtime, theme, format
├── infra/                   Docker Compose (dev/prod), Caddyfile, backup/restore, ops
├── docs/                    developer guide, demo, API reference, decisions, runbook, …
│   └── specs/done/          completed use-case specs (UC-001…UC-011)
├── .claude/rules/           coding conventions (auto-applied)
├── .github/workflows/       CI/CD (ci.yml, deploy.yml, restore-test.yml)
├── CLAUDE.md                contributor guidance + accumulated project facts
└── README.md
```

Locale files live in `web/src/shared/i18n/` as `cs-CZ.json`, `en-US.json`, `ru-RU.json`, `uk-UA.json`, `fil-PH.json`, `de-DE.json`.

---

## Testing & quality gates

**Backend** (Docker must be running — tests use Testcontainers):

```bash
dotnet build -warnaserror         # blocking: warnings are errors
dotnet test                       # xUnit integration suite (real Postgres)
```

**Frontend** (run from `web/`):

```bash
npm run lint                      # ESLint --max-warnings 0 (includes the no-OSM check:geo guard)
npm run tsc                       # strict TypeScript type-check
npm run test                      # Vitest unit + component tests (incl. vitest-axe a11y)
npm run build                     # production build
npm run size                      # bundle budgets (size-limit, brotli)
npm run e2e                       # Playwright e2e — boots the API harness (needs Docker)
```

Accessibility is checked mechanically per component (`vitest-axe`) and manually with Lighthouse; recorded scores are in the root **[DEMO.md](DEMO.md)**.

---

## Features by use-case

All eleven are complete and merged; full specs are in [`docs/specs/done/`](docs/specs/done/).

| UC | Title | Delivers |
|----|-------|----------|
| UC-001 | Data model & backend core | Entities, multi-tenancy, JWT + SMS-code auth, `OrderStateMachine`, SignalR skeleton, test infra |
| UC-002 | Dispatcher web app | Live board, quick-order form, order drawer & timeline, search, settings |
| UC-003 | Driver PWA | Shift on/off, ride offers, ride lifecycle, position reporting, offline queue |
| UC-004 | Customer PWA | Common-route & custom orders, phone-code login, live tracking, rating, phone fallback |
| UC-005 | Notifications | SMS + Web Push outbox, routing matrix, GSM-7 templates, per-fleet cost cap |
| UC-006 | Common routes, zones & pricing | Zone/route/place CRUD, containment math, deterministic price quote & lock |
| UC-007 | Reports, audit & tenant onboarding | CSV reports, audit timeline, fleet provisioning & self-service, GDPR retention |
| UC-008 | Infra, CI/CD & operations | Dockerfiles, compose, Caddy, GitHub Actions deploy + rollback, backups, runbook |
| UC-009 | Business analytics | Fleet dashboards + platform view, Chart.js, CSV/print, weekly KPI digest |
| UC-010 | Mapy.com geo migration | Backend geo proxy, two-tier cache, per-fleet credit budgets, degradation |
| UC-011 | Multilingual UI | Six languages, in-app selector, browser detection + persistence, parity tests |

---

## Conventions & invariants

- **Multi-tenancy** — every tenant-owned table has `FleetId`; EF Core global query filters enforce isolation; every feature ships a fleet-isolation test.
- **Order state** — all status changes go through `OrderStateMachine`; each transition writes an `order_events` row and broadcasts `OrderChanged` on SignalR in one transaction. Illegal transitions are expected errors (409), never exceptions.
- **Data** — timestamps are `timestamptz` UTC; money is integer CZK; phones are E.164; tables/columns `snake_case`, JSON `camelCase`.
- **Formatting is not localized** — money renders `cs-CZ` (`… Kč`) and dates render in `Europe/Prague` in every UI language.

The authoritative conventions live in [`.claude/rules/`](.claude/rules/) and [`CLAUDE.md`](CLAUDE.md); the product source of truth is [`.claude/state/00-PROJECT-CONTEXT.md`](.claude/state/00-PROJECT-CONTEXT.md).

---

## Documentation

| Doc | What's in it |
|-----|--------------|
| [docs/DEVELOPER.md](docs/DEVELOPER.md) | Browser-first quick start and a guided order-flow demo |
| [docs/DEMO.md](docs/DEMO.md) | API/`curl` walkthrough and the Playwright e2e suite |
| [docs/api.md](docs/api.md) | Generated REST API reference (from the live OpenAPI doc) |
| [docs/decisions.md](docs/decisions.md) | Architecture decision log (stack, styling, Mapy.com, i18n, …) |
| [docs/runbook.md](docs/runbook.md) | Operations: provision, deploy, rotate secrets, restore backup, incident checklist |
| [docs/costs.md](docs/costs.md) | Hosting / SMS / geo cost model per fleet |
| [docs/monitoring.md](docs/monitoring.md) | Logging, metrics, uptime, alerting |
| [docs/gdpr.md](docs/gdpr.md) | Retention, anonymization, customer self-deletion |
| [docs/driver-pwa-limits.md](docs/driver-pwa-limits.md) | Driver position-reporting degradation notes |

---

## Deployment

Production runs from `infra/docker-compose.prod.yml` behind **Caddy** (wildcard TLS, routing, auth rate-limiting); the `api` and `web` containers are internal-only. Images are built and published by CI; database migrations are applied out-of-band before bringing the stack up. CI/CD lives in [`.github/workflows/`](.github/workflows/) (`ci.yml` builds/tests, `deploy.yml` ships to the VPS with a health-check gate and auto-rollback). See [docs/runbook.md](docs/runbook.md) for the full procedure.

---

## Status

Greenfield build, all eleven use-cases (UC-001…UC-011) complete and merged to `main`. Internal / unlicensed — no open-source license is granted.
