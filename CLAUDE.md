# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

Greenfield. There is **no source code yet** — only the `.claude/` scaffold. The product to build is a multi-tenant taxi fleet system (dispatcher web app, driver PWA, customer PWA, one .NET backend, one Postgres DB) specified in `.claude/state/00-PROJECT-CONTEXT.md` and the numbered assignment files `.claude/state/01-*.md` … `08-*.md`. `.claude/state/README.md` gives the assignment dependency order (01 → 08∥02 → 03 → 04 → 06 → 05 → 07).

## How context loads (important asymmetry)

- `.claude/rules/*.md` are **auto-injected into every session** as project instructions.
- `.claude/state/00-PROJECT-CONTEXT.md` and the numbered assignments are **NOT auto-loaded** — read them deliberately before any feature work. `00-PROJECT-CONTEXT.md` declares itself the source of truth over the assignments.

## Stack decision (resolved 2026-09-10 — see docs/decisions.md)

The user decided: **.NET 10 + FastEndpoints**. The `.claude/rules/` conventions win over the original spec text; `00-PROJECT-CONTEXT.md` has been updated to match. Concretely:

- FastEndpoints REPR endpoints (`rules/api-design.md`), FastEndpoints `Validator<TRequest>` validators (`rules/validation.md`).
- .NET 10 / C# 14, EF Core 10 + Npgsql.
- No `Domain/` folder — vertical slices under `Features/`, shared logic (e.g. `OrderStateMachine`) in `Common/`, DbContext/entities/migrations in `Infrastructure/` (`rules/architecture.md`).
- Illegal order transitions are expected errors: failure result → `AddError(...)` + `Send.ErrorsAsync(409, ct)` — no `InvalidTransitionException`, no control-flow exceptions (`rules/error-handling.md`).
- Frontend stays React (per spec §4); there is no Flutter pipeline.

Note: `rules/logging.md`'s canonical property-name table (`InviteId`, `MeetupId`, …) comes from a different app; the style rules apply but use taxi-domain names (`OrderId`, `DriverId`, `FleetId`, …).

## Commands

No build exists yet. Once `/api` is scaffolded, the quality gate (from the conductor pipeline Phase 5 and the Definition of Done in `00-PROJECT-CONTEXT.md` §12) is:

```bash
dotnet build -warnaserror              # blocking
dotnet test                            # blocking — integration tests use Testcontainers, requires Docker running
dotnet format --verify-no-changes      # informational
```

Frontend (`/web`, React + Vite, once it exists): `eslint --max-warnings 0`, Vitest for logic, Playwright for the three critical flows.

## The /conductor pipeline

`/conductor <feature>` (`.claude/skills/conductor/SKILL.md`) orchestrates UC → design → implement → review with user-approval gates:

- State lives in `.claude/state/pipeline.json`; specs in `docs/specs/{todo,in-progress,done}/`.
- Agents: `designer` → `design-reviewer` → `developer` (TDD, stages changes, **never commits**) → `impl-reviewer`. Each writes `.claude/state/handoff-<agent>.json`; only the conductor writes `pipeline.json`.
- Only the conductor gates commit/PR; nothing commits without explicit user confirmation.

The `gc-*` skills (`gc-feature`, `gc-tdd`, `gc-debug`, `gc-migrate`, `gc-review`) are standalone .NET workflows usable outside the pipeline.

## Cross-cutting invariants (from the spec — apply to all backend work)

1. **Multi-tenancy**: every tenant-owned table has `FleetId`; EF Core global query filters enforce isolation; every feature ships a tenant-isolation integration test (fleet A cannot read fleet B). See `00-PROJECT-CONTEXT.md` §7.
2. **Order state machine**: all order status changes go through one class (`OrderStateMachine`) — never set `order.Status` directly. Every transition writes an `order_events` row and broadcasts `OrderChanged` on SignalR, in one transaction. The `taxi-order-state-machine` skill is the source of truth for statuses, transitions, actors, and side effects — read it whenever code touches order status.
3. **Conventions** (spec §6): timestamps `timestamptz` UTC; money as integer CZK; phone numbers E.164; tables/columns `snake_case`, JSON `camelCase`; Czech-first UI.

## Project-specific facts (discovered during implementation — do not rediscover)

- **FakeTimeProvider namespace**: the NuGet package is `Microsoft.Extensions.TimeProvider.Testing` but the actual C# namespace is `Microsoft.Extensions.Time.Testing`. Use `using Microsoft.Extensions.Time.Testing;` — the package-name spelling CS0234s.
- **Testcontainers 4.x PostgreSqlBuilder**: the parameterless `new PostgreSqlBuilder()` constructor is `[Obsolete]` and causes a CS0618 warning-as-error under `-warnaserror`. Always pass the image: `new PostgreSqlBuilder("postgres:16-alpine")`.
- **Route entity naming conflict**: `Taxi.Api.Infrastructure.Entities.Route` conflicts with `Microsoft.AspNetCore.Routing.Route` in files that have both using namespaces. Use a `using RouteEntity = Taxi.Api.Infrastructure.Entities.Route;` alias in files that need both.
- **EF Core package version conflict**: `EFCore.NamingConventions 10.0.1` and `Npgsql.EntityFrameworkCore.PostgreSQL 10.0.3` bring in EF 10.0.1/10.0.4 respectively, conflicting with `Microsoft.EntityFrameworkCore.Design *` (10.0.12). Fix: add `api/Directory.Build.props` that pins all EF Core packages to 10.0.12 via `PackageReference Update`, AND add explicit `Microsoft.EntityFrameworkCore` + `Microsoft.EntityFrameworkCore.Relational` at 10.0.12 directly to the test project.
- **FluentAssertions + expression trees**: `.Where(e => e.InnerException is PostgresException pe && pe.SqlState == "23505")` does not compile in expression tree context (CS8122). Instead use `.ThrowAsync<T>()` then `.Which.InnerException.Should().BeOfType<PostgresException>().Which.SqlState.Should().Be("23505")`.
- **dotnet ef migrations path**: use `--output-dir Infrastructure/Migrations` when adding migrations from inside `api/src/Taxi.Api`; omitting it puts the migration at the project root.
- **UUIDv7 value generator**: configured in `TaxiDbContext.OnModelCreating` by iterating `Model.GetEntityTypes()` and setting the generator on any property named "Id" of type `Guid`. FleetSettings.FleetId is excluded because its property name is not "Id".
- **Concurrency token choice (WI-03)**: used an explicit `int Version` column with `.IsConcurrencyToken()` (not xmin). `OrderService` (WI-07) is responsible for incrementing `Version` before saving.
- **JsonDocument for jsonb (WI-03)**: `OrderEvent.Payload`, `Zone.Polygon`, and `AuditLog.Diff` use `System.Text.Json.JsonDocument?` mapped with `.HasColumnType("jsonb")`. Callers must dispose `JsonDocument` after use or use `JsonDocument.Parse` for transient values.
- **UserRole.System (WI-07)**: A `System` member was added to `UserRole` enum for the Timeout transition (no human actor). EF stores enums as strings; adding a new member requires no migration (new string value is backward-compatible). `Actor.System` is a static property on `Actor`.
- **OrderEvent.ActorUserId FK (WI-07)**: `order_events.actor_user_id` has a FK to `users`. Integration tests seeding OrderEvents must ensure the actor's UserId is a real user row. Use a seeded dispatcher user's ID in the Actor, not a random Guid.
- **Version increment in OrderService (WI-07)**: `order.Version++` is called in `OrderService.TransitionAsync` immediately before `SaveChangesAsync`. EF adds Version to the UPDATE WHERE clause for optimistic concurrency but does NOT auto-increment it. Always increment explicitly.
- **PriceOverridden event (WI-07)**: When a Fixed-price order is completed with a different price (and a valid override reason), TWO OrderEvent rows are saved: one `Completed` + one `PriceOverridden`. `TransitionResult.Events` carries both. This supersedes the SKILL.md 'exactly one row' checklist.
- **Concurrency conflict test pattern (WI-07)**: To trigger `DbUpdateConcurrencyException`, pre-load the entity into scope2's DbContext BEFORE scope1 commits. Then scope1 saves (bumps Version), and scope2's subsequent `SaveChangesAsync` detects the stale Version token and throws. Sequential calls without pre-loading won't conflict because scope2 re-loads the updated version.
- **ICurrentTenant / query filters (WI-04)**: `TaxiDbContext` constructor takes `ICurrentTenant` — the design-time factory passes a `NullCurrentTenant` stub (FleetId=null). All 10 non-nullable tenant entities implement `ITenantEntity`; User/PushSubscription do NOT (nullable FleetId). Seeding and raw DbContext scopes (null-tenant) bypass SaveChanges guard. Use `IgnoreQueryFilters()` for cross-tenant reads in jobs/seed. Tests access `CurrentTenant` concrete via `InternalsVisibleTo`; `GetRequiredService<CurrentTenant>()` sets FleetId before using the scope's DbContext.
- **Middleware execution order (WI-04)**: `TenantResolutionMiddleware` is registered with `app.UseMiddleware<TenantResolutionMiddleware>()` _after_ `app.UseAuthentication()` (needs JWT claims) and _before_ `app.UseAuthorization()` (consistent with FastEndpoints ordering). Scoped `CurrentTenant` is written by middleware and read by `TaxiDbContext`; both must be in the same DI scope.
- **FastEndpoints enum serialization (WI-09)**: FastEndpoints uses System.Text.Json without `JsonStringEnumConverter` by default. Any endpoint request that accepts an enum property (e.g. `PaymentType?`) and receives a JSON string value (e.g. `"Cash"`) will throw a `JsonException` that propagates to the global handler → 500 with `DontCatchExceptions()`. Fix: `c.Serializer.Options.Converters.Add(new JsonStringEnumConverter())` in the `app.UseFastEndpoints(...)` lambda in `Program.cs`. EF Core's `HaveConversion<string>()` convention is DB-side only and does not affect HTTP deserialization.
- **DontCatchExceptions() breaks FastEndpoints validator 400 responses (WI-09 round-2)**: When an endpoint calls `DontCatchExceptions()` in `Configure()`, FastEndpoints' own exception catch is disabled for ALL exceptions including `ValidationFailureException`. If a registered `Validator<T>` fails, FE throws `ValidationFailureException` BEFORE `HandleAsync` runs, but with `DontCatchExceptions()` active that exception propagates to the global handler → 500. The fix (in `Common/ValidationFailureExceptionHandler.cs`) is a global `IExceptionHandler` registered before `AddProblemDetails()` in `Program.cs` that intercepts `ValidationFailureException` and writes a 400 ProblemDetails response. This is required for ALL endpoints in this codebase because `DontCatchExceptions()` is mandatory per `rules/api-design.md`. Any new `Validator<T>` class is automatically protected; the handler is already in place.
- **App-minted JWTs vs real-clock validation (WI-05)**: `JwtIssuer` mints access tokens via the injected `TimeProvider` (FakeTimeProvider in tests, pinned to 2026-09-10 12:00 UTC). JwtBearer validates token lifetime using the real `DateTime.UtcNow`. A login-response access token expires at 12:15 fake-UTC — effectively unusable in test follow-up requests at any real time outside that 15-minute window. Rule: in integration tests, assert on the login response by decoding claims (never by replaying the access token against the API). Authenticate follow-up HTTP calls via `AuthHelpers` which mints with `DateTime.UtcNow` + 1-hour expiry. WI-15's E2E acceptance test (real `POST /auth/staff/login` → use token) will need a workaround: either derive a factory that pins FakeTimeProvider to the test-start real time, or configure a `LifetimeValidator` delegate wired to the injected TimeProvider.

- **JsonDocument projection in EF Core LINQ queries (WI-10)**: Columns mapped as `jsonb` (e.g., `OrderEvent.Payload`, `Zone.Polygon`, `AuditLog.Diff`) use `System.Text.Json.JsonDocument?`. You cannot project `Payload.RootElement.Clone()` (or any `JsonDocument` member) inside a LINQ-to-SQL `Select()` — EF Core cannot translate it and throws at runtime, surfacing as HTTP 500 via `DontCatchExceptions()`. Pattern: load with `ToListAsync()` first, then do the projection/mapping in memory. This applies to any `Select()` that touches a `JsonDocument` property.

- **XML doc comments on positional record constructor parameters (WI-11)**: In positional record declarations (`public record Foo(int X, string Y)`), the parameters are NOT valid targets for `/// <summary>` XML doc comments. Adding them causes CS1587 ("XML comment not placed on a valid language element") which fails `-warnaserror`. Only add `/// <summary>` on the record class itself. If per-parameter docs are needed, use a property-based record instead (`public record Foo { public int X { get; init; } ... }`).

- **`required` on STJ-deserialized request properties (WI-11)**: Using C# `required` on a `record` property (e.g., `public required Guid VehicleId { get; init; }`) causes STJ to throw `JsonException` when the field is missing from the JSON body. With `DontCatchExceptions()`, this propagates to the global handler → 500 instead of 400. For request DTOs that have validators, use plain `public Guid VehicleId { get; init; }` (defaults to `Guid.Empty`) and let `NotEmpty().WithErrorCode(...)` in the validator catch the missing value as a 400.

- **SignalR hub tenant scope (WI-13)**: `TenantResolutionMiddleware` only runs on the SignalR negotiate HTTP request, not on hub method invocations. Each hub method invocation gets a fresh DI scope where `CurrentTenant.FleetId` is null. Fix: inject `CurrentTenant` (concrete class) into `FleetHub` via the primary constructor and call `currentTenant.FleetId = fleetId` at the start of each hub method that queries via global query filters. For `Subscribe` (customer JWT — no fleet_id claim), use `IgnoreQueryFilters()` with `o.CustomerUserId == sub` as the tenant-safe predicate.
- **SignalR test transport (WI-13)**: `factory.Server.CreateHandler()` supports HTTP but not WebSockets. Use `HttpTransportType.LongPolling` in test `HubConnectionBuilder` options; `AccessTokenProvider` sends `Authorization: Bearer ...` header which is validated by `JwtBearer` directly (the query-string `access_token` path in `OnMessageReceived` is for production WebSocket connections only).
- **IRealtimePublisher.DriverStatusChangedAsync signature (WI-13)**: The signature was changed to include `Guid fleetId` as the second parameter so the SignalR publisher can route to the correct `fleet:{fleetId}:dispatch` group. All callers must pass `driver.FleetId` or `order.FleetId`. Update `NoOpRealtimePublisher`, `RecordingRealtimePublisher`, `GoOnlineEndpoint`, `GoOfflineEndpoint`, and `OrderService` when this signature changes.
- **TaxiApiFactory.FakeTime exposed (WI-13)**: `FakeTimeProvider` is created in the `TaxiApiFactory` constructor and exposed as `public FakeTimeProvider FakeTime`. Tests that advance time (e.g. throttle tests) must create their own `new TaxiApiFactory(fixture.ConnectionString)` rather than using the shared `PostgresFixture.Factory` because advancing time is irreversible and would contaminate other tests.

- **Background job testability pattern (WI-14)**: Each job (`OfferTimeoutJob`, `StalePositionJob`) exposes an `internal RunTickAsync(CancellationToken)` method with all per-tick business logic. `ExecuteAsync` is a thin `PeriodicTimer → await RunTickAsync` shell. Integration tests construct job instances manually and call `RunTickAsync` directly — deterministic, no timer waits, no need to advance `FakeTimeProvider`.

- **OfferTimeoutJob tenant context (WI-14)**: `OrderService.TransitionAsync` loads orders through the EF query filter (requires non-null `CurrentTenant.FleetId`). The job scans in one scope with `IgnoreQueryFilters`, projects `(OrderId, FleetId)`, then per-order creates a fresh scope, resolves `CurrentTenant` concrete, sets `tenant.FleetId = order.FleetId`, and resolves `OrderService` — so the transition runs in the correct tenant context. One scope per order prevents a poisoned change-tracker from a StaleVersion failure leaking into the next order.

- **OfferTimeoutJob FleetSettings query (WI-14)**: To get per-fleet `OfferTimeoutSeconds`, project `(int?)scanDb.FleetSettings.IgnoreQueryFilters().Where(fs => fs.FleetId == o.FleetId).Select(fs => (int?)fs.OfferTimeoutSeconds).FirstOrDefault()`. The inner `(int?)` cast is mandatory — without it, `FirstOrDefault()` on an `int` subquery returns `0` (not null) when no row exists, causing every fleet without a FleetSettings row to use a 0-second timeout and time out all Assigned orders immediately.

- **StalePositionJob null LastPositionAt handling (WI-14)**: Drivers with `LastPositionAt == null` who have an open shift older than 5 min are also marked stale. Without this clause, a driver who goes online and never reports a position would never be auto-offllined. Design decision: mid-ride drivers (EnRoute/Busy) are marked Offline per §9 of the spec ("status != Offline") — this does NOT release the active order; the dispatcher must reassign. Auto-offlining mid-ride is a dispatcher problem per the SKILL.md commentary.

- **DriverPositionStore.GetFleetId dead code removed (WI-14)**: `DriverPositionStore.GetFleetId()` and the `FleetId` field in `DriverState` were dead after WI-13 (StalePositionJob reads from DB directly, not the in-memory store). Both were removed in WI-14 to eliminate dead code, along with the `fleetId` parameter on `TryUpdate` (the FleetHub call site was updated to match).

- **FleetHub.FlushPositionToDatabaseAsync (WI-14 carry-forward)**: Fixed to use `CancellationToken.None` on both `FirstOrDefaultAsync` and `SaveChangesAsync`. Constraint: the flush must complete even when the client's `ConnectionAborted` token fires (connection dropped mid-flight). Changed flush log from `LogInformation` to `LogDebug` (per-driver position writes are high-frequency noise in prod logs).

- **WI-15 E2E clock-trap workaround**: `E2ETaxiApiFactory` extends `TaxiApiFactory` (which must NOT be `sealed`) and registers a `PostConfigure<JwtBearerOptions>` `LifetimeValidator` that validates token lifetime against `FakeTime` rather than the real wall clock. This allows tokens minted by `JwtIssuer` (using pinned FakeTimeProvider) to be accepted by JwtBearer in integration tests. Do NOT advance `FakeTime` in the E2E factory — advancing time would age seeded orders and trigger background jobs against the shared DB.

- **Seed:Enabled flag (WI-15)**: `DevelopmentSeeder` is always registered in DI when `IsDevelopment()`. Automatic startup seeding is gated by `Seed:Enabled` config (default `true`). `TaxiApiFactory` sets `Seed:Enabled=false` to prevent auto-seeding in tests. Tests call `DevelopmentSeeder.SeedAsync()` directly via scope resolution for controlled seeding. The seeder is idempotent — keyed on fleet slug `demo` existing.

- **OrderEvents secondary sort by Id (WI-15)**: `GetOrderEventsEndpoint` sorts by `At` then `Id` (UUIDv7). Without the `ThenBy(e => e.Id)` tiebreaker, events with identical timestamps (all fake-clock events) are returned in arbitrary DB order, causing non-deterministic event sequence in tests.

- **TaxiApiFactory no longer sealed (WI-15)**: Changed from `sealed` to allow `E2ETaxiApiFactory` to extend it for the clock-trap workaround. `ConfigureWebHost` is overridden in the subclass with a `base.ConfigureWebHost(builder)` call first.

- **FastEndpoints double query param binding is locale-sensitive (A1)**: FastEndpoints does NOT use `CultureInfo.InvariantCulture` when binding `double` properties from GET query strings. On Czech locale (cs-CZ), `50.08` (dot-decimal) fails to parse with "Value [50.08] is not valid for a [Double] property!". Pattern: declare request DTO properties as `string?` and parse manually with `double.Parse(s, NumberStyles.Float, CultureInfo.InvariantCulture)` in `HandleAsync`. Add a FluentValidation rule with `.Must(s => double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out _))` to return a clean 400 for invalid input.

- **Playwright chromium version mismatch (laneB11)**: `@playwright/test 1.48.2` requires `chromium-1140` but the pre-fetched browser was `chromium-1243`. Run `cd web && npx playwright install chromium` once to download the pinned revision. The correct binary is then at `chromium-1140/chrome-win/chrome.exe`.
- **vitest picks up Playwright spec files (laneB11)**: Without an explicit `exclude`, vitest v3 discovers `e2e/**/*.spec.ts` and fails with "Two different versions of @playwright/test" and `TypeError: test.describe.serial is not a function`. Fix: add `exclude: ['**/node_modules/**', '**/e2e/**']` to `vitest.config.ts` `test` options.
- **CreateOrderResponse shape mismatch (laneB11)**: `client.ts` originally typed `CreateOrderResponse` as `{ id: string }` but the API (`CreateOrderEndpoint`) returns `{ order: OrderDetailDto }`. This silently broke the B4 new-order highlight (orderId was `undefined`). The canonical fix is in `client.ts` + `useCreateOrder.ts` (use `data.order.id`).
- **Playwright test-results are volatile (laneB11)**: `test-results/` and `playwright-report/` change on every run. Add both to `.gitignore`. Do not stage `web/test-results/.last-run.json`.

## Known gaps in the scaffold (referenced but missing)

- `.claude/hooks/` — the agents' `PreToolUse` Bash-allowlist hooks (`designer-bash-allowlist.sh`, `developer-bash-allowlist.sh`, `reviewer-bash-allowlist.sh`) and the conductor's `reinject-state.sh` / `split-compound-commands.sh` do not exist; agent Bash hooks will fail until created or removed from the agent frontmatter.
- `.claude/schemas/` — `pipeline-state.v1.json`, `spec.v1.json`, and the work-items schema referenced by the conductor and `rules/schema-review.md` do not exist.
- Agent frontmatter names MCP servers (`cwm-roslyn-navigator`, `serena`, `context7`, `microsoft-docs`) and skills (`architecture-advisor`, `vertical-slice`, `security-scan`, `superpowers:*`) not configured in this repo.
- `.claude/assignement/` is empty (note the folder-name typo); the actual assignments live in `.claude/state/`.
- `.claude/skills/taxi-order-state-machine/taxi-order-state-machine.skill` is a zip archive, not an unpacked `SKILL.md` — it may not load as a skill until extracted.
