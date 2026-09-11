# Decisions

## 2026-09-10 — Backend stack: .NET 10 + FastEndpoints

The `.claude/` scaffold contained two contradictory stacks: `.claude/rules/` + agents + `gc-*` skills (FastEndpoints, .NET 10, vertical slices) vs the original `00-PROJECT-CONTEXT.md` (Minimal APIs, .NET 9, `Domain/` folder). The user decided in favor of the rules:

- .NET 10 / C# 14, EF Core 10 + Npgsql, FastEndpoints (REPR) instead of Minimal APIs.
- Layout per `rules/architecture.md`: `Features/` vertical slices, `Common/` for shared logic (OrderStateMachine), `Infrastructure/` for DbContext/entities/migrations/external services, `Realtime/` for SignalR. No `Domain/` folder.
- Illegal order-state transitions return a failure result mapped to HTTP 409 via `AddError(...)` + `Send.ErrorsAsync(409, ct)` — no `InvalidTransitionException` (rules/error-handling.md forbids control-flow exceptions).
- Validators are FastEndpoints `Validator<TRequest>` (FluentValidation-based).
- Frontend stays React + Vite (unchanged). The Flutter branch of the conductor pipeline was removed — it referenced agents that never existed here.

`00-PROJECT-CONTEXT.md` §4/§5/§8 and assignment 01 were updated to match. The `taxi-order-state-machine` skill archive still says `Domain/Orders/OrderStateMachine.cs` and `InvalidTransitionException`; read it for transition semantics but follow this decision for location and error handling.

---

## 2026-09-10 — Implementation assumptions (WI-01 through WI-15)

Eleven assumptions resolved where the spec was silent or self-contradictory. Echoed from `docs/specs/in-progress/backend-core-work-items.md ## Assumptions` per acceptance criterion #6.

1. **No outbox table.** SKILL.md and UC line 32 mention an outbox; the exhaustive 15-entity list has none. v1 persists order + OrderEvent in one transaction and publishes via `IRealtimePublisher` AFTER commit. No outbox table is created.

2. **`Common/Orders/`, not `Domain/Orders/`; no `InvalidTransitionException`; failure result carries an error kind.** The state machine lives in `Common/Orders/` and failures return a failure result — `NotEntitled` (wrong/non-assigned actor or role not permitted) or `IllegalTransition` (legal actor, illegal from-status or business-rule violation). `OrderService` adds `StaleVersion` on `DbUpdateConcurrencyException`. Endpoints map single pinned statuses: `NotEntitled` → no-leak 404, `IllegalTransition` → 409, `StaleVersion` → 409.

3. **`by-code` tracking is customer-JWT-only in v1.** The signed-token path mentioned in UC §6 is deferred to assignment 05. v1 authorizes `GET /orders/by-code/{code}` by a customer JWT that owns the order.

4. **`ITenantEntity` membership is explicit.** `User` and `PushSubscription` have nullable `FleetId` (customers/superadmin have none) — a blanket filter would be wrong for them. These two entities filter only rows where `FleetId` is non-null. `RefreshToken` and `SmsCode` are not tenant entities (keyed by user/phone, cross-tenant by nature).

5. **Seed orders go through the state machine.** `order.Status` is never set directly. Seed data drives sample orders into their target states via `OrderStateMachine`/`OrderService`, not by assigning `Status`.

6. **`fleet_id` claim name is a shared constant defined in the tenancy WI.** `TenantClaims.FleetId` is defined in `Common/Tenancy/TenantClaims.cs`. This lets auth WIs (which mint JWTs) and the tenancy middleware (which reads them) share one constant, breaking the apparent auth↔tenancy cycle.

7. **Complexity scale is XS/S/M/L** (no XL, per the conductor handoff shape). The entities + migration WI is `L` and indivisible (one initial migration).

8. **Password hashing: BCrypt** (`BCrypt.Net-Next`). Assignment §4 allows Argon2id or BCrypt; BCrypt has a lighter dependency footprint.

9. **`AuditLog` is provisioned-but-unwritten in v1.** The `AuditLog` table is modelled in WI-03 (schema completeness) but no WI writes to it this UC — audit wiring is assignment 07.

10. **`by-code` tracking is unavailable to phone-order customers in v1.** Phone-created orders have `CustomerUserId = null` and no customer JWT, so their customers cannot track by code until the signed-token path lands in assignment 05. Accepted consequence, not a bug.

11. **`OrderService` in `Common/Orders/` is a sanctioned exception to "no service classes".** `architecture.md#banned-patterns` forbids Service/Manager classes for *feature* logic, but order-transition logic is reused by 2+ consumers (WI-09 endpoints, WI-14 jobs, WI-15 seeder), so it belongs in `Common/` per `architecture.md#common-infrastructure`. Endpoints still own `HandleAsync` and only delegate the transactional transition.

### WI-03 nullability micro-deviations

- `OrderEvent.FromStatus` — nullable (`OrderStatus?`). The `Created` event has the same `FromStatus` and `ToStatus` (both `New`), not null. However the field is kept nullable to allow future event types where from-status is not applicable.
- `Route.ValidFromTime` — nullable (`TimeOnly?`). Null means valid all day (no lower bound).
- `AuditLog.ActorUserId` — nullable (`Guid?`). Allows system-generated audit entries with no human actor.

### WI-15 specific decisions

- **Seed driver passwords:** `driver1@demo.local`, `driver2@demo.local`, `driver3@demo.local` all seeded with `Demo1234!` (same as admin and dispatcher) so the E2E acceptance test can perform real staff logins for the driver side.
- **`Seed:Enabled` flag:** `DevelopmentSeeder` is always registered in Development but only auto-runs at startup when `Seed:Enabled` config value is true (default). Tests disable auto-seeding via `builder.UseSetting("Seed:Enabled", "false")` in `TaxiApiFactory` and call `DevelopmentSeeder.SeedAsync()` directly to control timing.
- **Migration at startup:** In Development mode, `Program.cs` calls `database.MigrateAsync()` after `app.Build()` so `docker compose up` is self-contained. Tests bypass this because `PostgresFixture.InitializeDatabaseAsync()` applies migrations independently.
- **`docs/api.md` generation mechanism:** `docs/api.md` is generated from the live OpenAPI document by the `OpenApi_Document_GeneratesApiMarkdown` test in `api/tests/Taxi.Api.Tests/Seed/SeedAndEndToEndTests.cs`. The test fetches `/swagger/v1/swagger.json`, groups operations by tag, renders a markdown table per section, and overwrites `docs/api.md` on every run. The file therefore cannot drift from the actual API surface. A static footer (error codes, concurrency, tenant isolation) is appended by the generator. The `OpenApi_Document_ListsAllExpectedEndpoints` test additionally asserts an explicit (verb, path) list so dropped `FeatureConfiguration` classes are caught immediately.
- **Clock-trap workaround for E2E test:** `JwtIssuer` mints access tokens using the injected `FakeTimeProvider` (pinned to 2026-09-10 12:00 UTC). JwtBearer validates tokens against real wall-clock time, so minted tokens appear expired. The E2E test uses a dedicated `E2ETaxiApiFactory` that registers a `TokenValidationParameters.LifetimeValidator` delegate wired to `FakeTime`. This delegates lifetime validation to the same fake clock used for minting, so tokens are always valid during tests without advancing the clock (advancing would age seeded orders and trigger background jobs).
- **TiebreakerSort for order events:** `GetOrderEventsEndpoint` sorts events by `At` then `Id` (UUIDv7). This ensures stable ordering when multiple events share the same timestamp (e.g., in tests where all events have the same fake timestamp).
- **`NoOpRealtimePublisher` removed:** Superseded by `SignalRRealtimePublisher` (WI-13). The remaining usage in `OrderServiceTests` was replaced with `RecordingRealtimePublisher`.
