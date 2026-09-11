# UC-001 — Data model & backend core

- **Sequence:** 001
- **Stack:** backend
- **Complexity tag:** novel
- **Sources of truth:** `.claude/state/00-PROJECT-CONTEXT.md` (project context), `.claude/state/01-data-model-and-backend-core.md` (deliverables detail), `docs/decisions.md` (stack decision: .NET 10 + FastEndpoints), `taxi-order-state-machine` skill (transition semantics).

## Title

Greenfield backend foundation: solution, complete v1 schema, multi-tenancy, auth, order state machine, SignalR hub skeleton, background jobs, seed data, test infrastructure.

## Actors

- **Dispatcher / FleetAdmin** — staff login, order CRUD + assign/reassign/cancel, driver & vehicle & staff management.
- **Driver** — staff login, accept/decline/arrive/start/complete, go online/offline, position updates.
- **Customer** — phone + SMS-code login, create order, view own order.
- **SuperAdmin** — cross-tenant access (explicit `IgnoreQueryFilters()`).
- **System** — offer-timeout job, stale-position job.

## Preconditions

- Empty repository; no prior code. Docker available for Postgres (dev + Testcontainers).
- Stack: .NET 10, FastEndpoints, EF Core 10 + Npgsql, PostgreSQL 16 — per `docs/decisions.md`. Conventions in `.claude/rules/*.md` are binding.
- Layout: `/api/src/Taxi.Api` with `Features/`, `Common/` (OrderStateMachine, ICurrentTenant), `Authorization/`, `Infrastructure/` (DbContext, entities, migrations, stubs), `Realtime/`; tests in `/api/tests/Taxi.Api.Tests` (context §5).

## Main flow (system-level)

1. Solution + `Program.cs` wiring (Serilog, EF Core, JWT, policies, FastEndpoints, Problem Details, SignalR, health checks, OpenAPI, CORS) — assignment §1.
2. All 15 v1 entities + indexes + initial migration — assignment §2 (entity list is exhaustive; add nothing; Customer = User with Role=Customer, not a separate entity).
3. Multi-tenancy: `ICurrentTenant` middleware resolution (JWT claim → `X-Fleet-Slug` header → subdomain), global query filters on `ITenantEntity`, `SaveChanges` guard — assignment §3, context §7.
4. Auth endpoints under `auth/` (customer SMS-code flow with rate limits, staff login, refresh rotation, logout) — assignment §4.
5. `OrderStateMachine` in `Common/Orders/` + `OrderService` transaction wrapper (order + event + outbox in one transaction; failure result → 409, no exceptions) — assignment §5, context §8.
6. Order endpoints (create, list w/ filters, detail, by-code reduced DTO, all transition actions, notes, events) — assignment §6.
7. Driver, vehicle, staff endpoints — assignment §7.
8. SignalR hub `/hubs/fleet` with groups, throttled `UpdatePosition`, `IRealtimePublisher` abstraction — assignment §8, context §10.
9. Background jobs: `OfferTimeoutJob`, `StalePositionJob` — restart-safe (DB state) — assignment §9.
10. Development seed data (fleet `demo`, users, vehicles, tariff, zones, routes, sample orders) — assignment §10.
11. Test infrastructure: Testcontainers Postgres fixture, `WebApplicationFactory` auth helpers, coverage minimums — assignment §11.

## Acceptance criteria (from assignment 01, binding)

1. `docker compose -f infra/docker-compose.dev.yml up` starts API + Postgres; `/health/ready` returns 200; Swagger lists all endpoints.
2. Seeded dispatcher can log in, create an order, assign a driver; seeded driver can accept, arrive, start, complete. Events recorded in order.
3. Dispatcher of fleet A gets **404** (not 403 — no existence leak) for fleet B's order.
4. Driver `UpdatePosition` at 10 Hz throttled to ≤ 1 per 3 s and reaches a connected dispatcher client (test SignalR client proves it).
5. API restart does not lose an `Assigned` order's timeout.
6. `/docs/api.md` generated; `/docs/decisions.md` updated with decisions made during implementation.

## Out of scope

Any frontend; actual SMS/push sending (interfaces + `ConsoleSmsSender` only); real OSRM calls (interface only); reports; auto-dispatch (v1.1); tenant onboarding.

## Non-functional requirements

- Money integer CZK; UUID v7 PKs; `timestamptz` UTC; E.164 phones; `snake_case` DB naming — context §6.
- Tenant isolation test for every tenant table — context §7/§12.
- Zero build warnings (`-warnaserror`); `dotnet format` clean — context §12.
- Concurrency: two dispatchers assigning the same order → one gets 409 (row `Version` token).
- No paid services; runs on a single VPS via Docker Compose — context §2.

## Notes for the designer

- This UC is intentionally large — decompose into small, dependency-ordered work items (solution scaffold → entities/migrations → tenancy → auth → state machine → endpoints → hub → jobs → seed → tests are a natural gradient, but tests are per-WI red-green, not a final WI).
- `.claude/schemas/spec.v1.json` does not exist in this repo; this markdown structure is the spec contract for this run.
- The `taxi-order-state-machine` skill archive references `Domain/Orders/` and `InvalidTransitionException` — superseded by `docs/decisions.md` (location `Common/Orders/`, failure-result → `Send.ErrorsAsync(409, ct)`); its transition table remains authoritative.
