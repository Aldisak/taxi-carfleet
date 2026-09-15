# 00 — PROJECT CONTEXT (read this before every assignment)

This file is the single source of truth for the whole project. Every agent reads it first.
If an assignment contradicts this file, this file wins. If something is missing, make the simplest
decision consistent with the principles below, document it in `/docs/decisions.md`, and continue.

## 1. What we are building

A taxi fleet system for a small taxi company (3 cars) in Kolín / Kutná Hora, Czech Republic.
Today the company works only by phone. Competitors have an app. We are building:

1. **Dispatcher web app** — the person who answers the phone creates orders and assigns drivers.
2. **Driver PWA** — drivers go online, receive orders, update ride status, send their position.
3. **Customer PWA** — customers order a ride (mostly via "Common routes" with fixed prices) and track the car.
4. **Backend** — one .NET service, one Postgres database, multi-tenant from day one.

The system will later be **resold to other taxi fleets**. A new fleet must be a new row in the database
plus a subdomain — never a new deployment.

## 2. Non-negotiable principles

1. **Reliability over features.** A lost order is lost money. Every write goes to the DB before anything is confirmed to a user.
2. **Phone orders stay first-class.** The dispatcher must create an order from a phone call in under 20 seconds.
3. **Cheap to run.** Target under €10/month for one fleet on a single VPS. No paid managed services except SMS.
4. **Simple UX.** A 55-year-old driver uses it without training. Big buttons, few screens, Czech language.
5. **Azure/cloud agnostic.** No vendor-specific services. Plain .NET + Postgres + Docker only.
6. **Multi-tenant everywhere.** Every tenant-owned table has `fleet_id`. No query may ever cross tenants.
7. **Truthful fallback.** When a driver ignores the app, the dispatcher can still mark reality manually.
8. **Small and boring.** One backend process, one database, one frontend codebase. Do not add services.

## 3. Roles

| Role | Who | Client |
|---|---|---|
| `Customer` | Public, identified by phone number | Customer PWA |
| `Driver` | Employee of a fleet | Driver PWA |
| `Dispatcher` | Answers phone, assigns rides, manages routes | Dispatcher web (desktop) |
| `FleetAdmin` | Owner; same as Dispatcher + reports + settings | Dispatcher web |
| `SuperAdmin` | Us; creates fleets | Simple admin page / CLI |

A user belongs to exactly one fleet (except SuperAdmin). Customers are global users linked to fleets via orders.

## 4. Technology stack (fixed — do not substitute)

### Backend (`/api`)
- .NET 10, ASP.NET Core with **FastEndpoints** (REPR pattern, vertical slices — conventions in `.claude/rules/api-design.md` and `.claude/rules/architecture.md`)
- **SignalR** hub at `/hubs/fleet` (self-hosted, no Azure SignalR)
- **EF Core 10 + Npgsql**, code-first migrations
- **PostgreSQL 16**
- Auth: JWT (access 15 min, refresh 30 days) issued by our own API. Customer login = phone + SMS code. Driver/Dispatcher = email + password.
- Background jobs: `IHostedService` in the same process (no Hangfire, no Quartz, no queue).
- Validation: FastEndpoints validators (`Validator<TRequest>`, FluentValidation-based — `.claude/rules/validation.md`). Expected errors via the `Send.*` pattern (`.claude/rules/error-handling.md`); unexpected errors → RFC 7807 Problem Details from the global exception handler.
- Logging: Serilog to console (JSON). Health checks at `/health/live` and `/health/ready` (use the `dotnet-healthchecks` skill if available).
- Tests: xUnit + Testcontainers (real Postgres). No mocking of EF.

### Frontend (`/web`)
- React 18 + TypeScript + Vite, single codebase, role-based route groups: `/c/*` customer, `/d/*` driver, `/x/*` dispatcher.
- **styled-components** for styling (user decision 2026-09-11, replaces Tailwind — see `docs/decisions.md`). No component library except headless primitives if needed.
- React Router 6, TanStack Query, Zustand (only for tiny cross-cutting state).
- Maps: **Leaflet** rendering **Mapy.com REST API** raster tiles. Routing/estimates/geocoding/autocomplete: **Mapy.com REST API** behind our backend proxy (UC-010, replaces OpenStreetMap tiles + OSRM + Nominatim + Photon). Details:
  - **Two-key model:** a per-fleet **browser key** (used client-side for tiles + logo, restricted by HTTP referrer, served anonymously via `GET /geo/config`) and a **server key** (used only server-side by `IMapyClient`, never sent to the browser). Demo/first-day fleets fall back to env keys (`Mapy__BrowserKey` / `Mapy__ServerKey`).
  - **Caching rules:** two-tier `GeoCache` (in-memory L1 + `geo_cache` Postgres L2) with per-kind TTLs; `geo_usage` counts **cache misses only** (real upstream credit spend) for per-fleet monthly budgets + 80 %/100 % alerts. QuickPlace lookups are cached forever.
  - **Graceful degradation:** the resilience boundary (4 s timeout, 1 retry on 5xx, circuit breaker) lives inside `MapyClient`; on failure it returns `GeoResult.Unavailable` and the UI shows degraded banners + a wider "orientační odhad" estimate rather than a hard error.
  - **No vendor lock-in:** all Mapy access sits behind `IMapyClient`/`IGeoService`, so the provider is replaceable without touching endpoints or the frontend.
- PWA: `vite-plugin-pwa` (Workbox). Web Push with VAPID.
- i18n: `i18next`. **Czech is the default language.** All user-facing strings go through i18n; no hardcoded text.
- Tests: Vitest for logic, Playwright for the three critical flows (create order, driver accept, customer order).

### Infra (`/infra`)
- Docker Compose: `api`, `web` (static, served by Caddy), `db` (Postgres), `caddy` (HTTPS reverse proxy).
- Nightly `pg_dump` to S3-compatible object storage.
- GitHub Actions: build, test, push image, deploy via SSH.

### External services
- SMS: Czech provider abstracted behind `ISmsSender`. First implementation: `GoSmsSender` (HTTP API). Second: `ConsoleSmsSender` for dev.
- Push: Web Push, our own VAPID keys.

## 5. Repository layout

```
/api
  /src/Taxi.Api            ← the only runnable project
    /Features/<Feature>/   ← vertical slices: endpoint + request/response + validator + errors + feature configuration
    /Common/               ← shared logic used by 2+ features: OrderStateMachine, ICurrentTenant, value objects
    /Authorization/        ← policies, handlers
    /Infrastructure/       ← DbContext, entities, migrations, SMS, push, Mapy.com geo client, jobs
    /Realtime/             ← SignalR hub + event broadcasting
    Program.cs
  /tests/Taxi.Api.Tests
/web
  /src
    /app                   ← router, providers, layouts
    /features/<feature>    ← screens + hooks + api calls
    /shared                ← ui, api client, i18n, map
    /locales/cs.json, en.json
/infra
  docker-compose.yml, Caddyfile, backup.sh, .github/workflows/
/docs
  decisions.md, api.md (generated from OpenAPI), runbook.md
```

## 6. Data conventions

- Primary keys: **UUID v7** (`Guid.CreateVersion7()`).
- All timestamps: `timestamptz`, stored and transferred in UTC. Frontend formats to `Europe/Prague`.
- Money: **integer CZK** (`int`, column suffix `_czk`). No decimals, no haléře. Currency is per fleet (`fleets.currency`, default `CZK`) but v1 only supports CZK.
- Coordinates: `latitude double`, `longitude double`. No PostGIS in v1 (keep the DB plain). Zone containment is computed in code (ray-casting for polygons, haversine for circles).
- Phone numbers: stored E.164 (`+420...`). Normalize on input.
- Soft delete only where an assignment says so (`deleted_at`). Otherwise hard delete is forbidden for orders and events.
- Naming: tables and columns `snake_case`, C# `PascalCase`, JSON `camelCase`.

## 7. Multi-tenancy rules (critical)

- `FleetId` column on: users (except customers/superadmin), drivers, vehicles, orders, order_events, routes, zones, tariffs, settings, invites, driver_shifts, push_subscriptions.
- The current fleet is resolved per request from, in order: JWT claim `fleet_id`; `X-Fleet-Slug` header; subdomain. Stored in `ICurrentTenant`.
- EF Core **global query filters** on every tenant entity: `e => e.FleetId == currentTenant.FleetId`. Writes set `FleetId` automatically in `SaveChanges`.
- Integration tests must include at least one test per feature proving tenant isolation (fleet A cannot read fleet B).

## 8. Order state machine (shared by all assignments)

```
New ──assign──▶ Assigned ──accept──▶ Accepted ──arrive──▶ Arrived ──start──▶ InProgress ──finish──▶ Completed
 ▲                 │                                                                          
 └────decline/timeout                                                                           
Any state before InProgress ──cancel──▶ Cancelled (with reason + who)
```

| Transition | Allowed by |
|---|---|
| New → Assigned | Dispatcher, System (auto-dispatch, v1.1) |
| Assigned → Accepted | Driver |
| Assigned → New (decline / timeout) | Driver, System |
| Accepted → Arrived | Driver |
| Arrived → InProgress | Driver |
| InProgress → Completed | Driver (must enter final price + payment type) |
| New/Assigned/Accepted/Arrived → Cancelled | Dispatcher, Customer (only New/Assigned/Accepted), Driver (Arrived only, reason "no-show") |
| Assigned/Accepted/Arrived → Assigned (reassign) | Dispatcher |

Every transition writes one row to `order_events` and broadcasts `OrderChanged` on SignalR. Implement the state machine **once** in `Common/Orders/OrderStateMachine.cs` and reuse it everywhere. Illegal transitions are expected errors, not exceptions: the state machine returns a failure result and the endpoint maps it to HTTP 409 via `AddError(...)` + `Send.ErrorsAsync(409, ct)` (`.claude/rules/error-handling.md`).

## 9. API conventions

- Base path `/api/v1`. Routes kebab-case, plural nouns: `/api/v1/orders/{id}/assign`.
- Actions on resources are POST verbs: `/orders/{id}/accept`, `/orders/{id}/cancel`.
- Lists: `?page=1&pageSize=50`, response `{ items, total, page, pageSize }`.
- Every endpoint has an OpenAPI summary and at least one integration test.
- Auth policies: `CustomerOnly`, `DriverOnly`, `DispatcherOnly` (includes FleetAdmin), `FleetAdminOnly`, `SuperAdminOnly`.

## 10. SignalR contract (`/hubs/fleet`)

Groups: `fleet:{fleetId}:dispatch` (dispatchers), `driver:{driverId}`, `order:{orderId}` (customer tracking a ride).

Server → client events:
- `OrderChanged(orderDto)` — any order change.
- `DriverPositionChanged({ driverId, lat, lng, heading, speed, at })` — to dispatch group and to the order group of that driver's active order.
- `DriverStatusChanged({ driverId, status })`.
- `NewOrderOffered(orderDto, expiresAt)` — to one driver.

Client → server methods:
- `UpdatePosition(lat, lng, heading, speed)` — drivers only, max every 3 s (server throttles).
- `Subscribe(orderId)` — customer joins `order:{id}` if they own it.

## 11. UX rules (all clients)

- Czech first. Formal "vy" for customers, informal "ty" is acceptable for drivers.
- Minimum touch target 48 px. Primary action is one big button at the bottom on mobile.
- Every screen works offline in the sense that it shows the last known state and a clear "offline" banner; actions queue and retry where safe (driver status updates) or are blocked with a message where not (creating an order).
- No spinners longer than 1 s without a message. No modals with more than two buttons.
- Errors are sentences a human understands. Never show a stack trace or JSON.

## 12. Definition of Done (every assignment)

1. Code compiles with zero warnings; `dotnet format` and `eslint --max-warnings 0` pass.
2. All acceptance criteria in the assignment are demonstrably met (add a `DEMO.md` with steps or a Playwright test).
3. Integration tests pass against real Postgres in CI.
4. Tenant isolation test exists for every new tenant table.
5. OpenAPI regenerated to `/docs/api.md`.
6. `docs/decisions.md` updated with any decision you had to make.
7. One PR per assignment, conventional commit messages, PR description lists what was built and what was skipped.
8. No TODOs left in code. Unfinished work goes into the PR description as "Follow-ups".

## 13. Assignment order and dependencies

```
01 Data model & backend core   ─┐
08 Infra & deployment           ─┼─ can run in parallel after 01's schema is merged
02 Dispatcher web              ──┘
03 Driver PWA                  ── after 02
04 Customer PWA                ── after 03
05 Notifications (SMS + push)  ── after 04
06 Common routes & zones       ── after 04 (backend part can start after 01)
07 Reports, audit, tenant onboarding ── last
```

Ship 01 + 02 first. That alone replaces the paper notebook and gives real feedback.
