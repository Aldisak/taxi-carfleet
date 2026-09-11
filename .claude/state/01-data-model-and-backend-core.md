# Assignment 01 — Data model & backend core

Read `00-PROJECT-CONTEXT.md` first. This assignment creates the foundation every other assignment builds on.
Get it right: later agents will not change the schema without a migration and a decision record.

## Goal

A running .NET 10 FastEndpoints API with the complete v1 database schema, multi-tenancy, authentication,
the order state machine, and the SignalR hub — but **no business screens yet**.

## Scope

**In:** solution structure, entities, migrations, tenant resolution, auth, state machine, hub skeleton,
seed data, test infrastructure, OpenAPI.
**Out:** any frontend, SMS/push sending (interfaces only), OSRM calls (interface only), reports.

## Deliverables

### 1. Solution
- `/api/Taxi.sln` with `Taxi.Api` and `Taxi.Api.Tests`.
- `Program.cs` wires: Serilog, EF Core + Npgsql, JWT auth, authorization policies, FastEndpoints (+ its validators),
  Problem Details, SignalR, health checks, OpenAPI (Swagger UI only in Development), CORS for the web origin.
- `appsettings.json` uses env vars for every secret: `ConnectionStrings__Db`, `Jwt__Key`, `Sms__ApiKey`, `Push__VapidPublic`, `Push__VapidPrivate`.

### 2. Entities (all in `/Domain`)

Implement exactly these. Add fields only if an assignment requires them.

**Fleet** — `Id, Slug (unique, lowercase, a-z0-9-), Name, Phone, Currency='CZK', TimeZone='Europe/Prague', IsActive, CreatedAt`
**User** — `Id, FleetId (nullable for Customer/SuperAdmin), Role (enum), Email (unique per fleet, nullable), PasswordHash (nullable), Phone (E.164, unique for customers), DisplayName, IsActive, CreatedAt, LastLoginAt`
**Driver** — `Id, FleetId, UserId (1:1), Status (Offline/Free/EnRoute/Busy), CurrentVehicleId (nullable), LastLat, LastLng, LastPositionAt, IsActive`
**Vehicle** — `Id, FleetId, Plate, Make, Model, Color, Seats, IsActive`
**DriverShift** — `Id, FleetId, DriverId, VehicleId, StartedAt, EndedAt (nullable)` — written on go-online / go-offline.
**Customer profile is User with Role=Customer.**
**Order** — `Id, FleetId, PublicCode (6 chars, unique per fleet, human-readable e.g. "K7F2A9"), Status, Source (Phone/App/Dispatcher), CustomerUserId (nullable — phone orders may have none), CustomerPhone, CustomerName (nullable),
  PickupAddress, PickupLat, PickupLng, DropoffAddress (nullable), DropoffLat, DropoffLng (nullable),
  ScheduledAt (nullable = ASAP), Note (nullable), Passengers (default 1),
  PriceType (Estimate/Fixed/Meter), EstimatedPriceCzk (nullable), FixedPriceCzk (nullable), RouteId (nullable), FinalPriceCzk (nullable), PriceOverrideReason (nullable),
  PaymentType (Cash/Card/Invoice, nullable until completed),
  DriverId (nullable), VehicleId (nullable), AssignedAt, AcceptedAt, ArrivedAt, StartedAt, CompletedAt, CancelledAt, CancelReason, CancelledByRole,
  CreatedByUserId, CreatedAt, UpdatedAt, Version (concurrency token)`
**OrderEvent** — `Id, FleetId, OrderId, Type (enum: Created, Assigned, Accepted, Declined, Timeout, Arrived, Started, Completed, Cancelled, Reassigned, PriceOverridden, NoteAdded), FromStatus, ToStatus, ActorUserId (nullable), ActorRole, Payload (jsonb), At`
**Route** — `Id, FleetId, Name, Type (PointToPoint/Zone/ZoneToZone), PriceCzk, FromZoneId (nullable), ToZoneId (nullable), FromLat/Lng, ToLat/Lng (nullable), ValidFromTime, ValidToTime (nullable time-of-day), ValidDays (bitmask), Priority, IsEnabled, DeletedAt`
**Zone** — `Id, FleetId, Name, Shape (Circle/Polygon), CenterLat, CenterLng, RadiusMeters (nullable), Polygon (jsonb array of [lat,lng]), IsEnabled`
**Tariff** — `Id, FleetId, Name, BaseFareCzk, PerKmCzk, PerMinuteWaitingCzk, MinimumFareCzk, IsDefault, IsEnabled`
**FleetSettings** — `FleetId (PK), OfferTimeoutSeconds=45, AutoDispatchEnabled=false, AutoDispatchAfterSeconds=60, MaxOfferRadiusKm=15, SmsSenderName, WelcomeText`
**PushSubscription** — `Id, FleetId (nullable for customers), UserId, Endpoint, P256dh, Auth, UserAgent, CreatedAt, LastUsedAt`
**RefreshToken** — `Id, UserId, TokenHash, ExpiresAt, RevokedAt, CreatedAt`
**SmsCode** — `Id, Phone, CodeHash, ExpiresAt, Attempts, UsedAt`
**AuditLog** (generic, for non-order changes) — `Id, FleetId, ActorUserId, Entity, EntityId, Action, Diff (jsonb), At`

Indexes: `orders (fleet_id, status)`, `orders (fleet_id, scheduled_at)`, `orders (fleet_id, created_at desc)`, `orders (fleet_id, public_code) unique`, `order_events (order_id, at)`, `drivers (fleet_id, status)`, `users (phone) unique where role='Customer'`.

### 3. Multi-tenancy
- `ICurrentTenant { Guid? FleetId; string? Slug; }` scoped service, resolved by middleware per §7 of context.
- Global query filters on every `ITenantEntity`. `SaveChanges` override sets `FleetId` if null and throws if an entity's `FleetId` mismatches the current tenant.
- SuperAdmin endpoints use `IgnoreQueryFilters()` explicitly and are in a separate feature folder.

### 4. Authentication
Endpoints under `/api/v1/auth`:
- `POST /customer/request-code { phone }` → sends SMS via `ISmsSender` (ConsoleSmsSender in dev logs the code). Rate limit: 3 per phone per 10 min, 1 per phone per 60 s.
- `POST /customer/verify-code { phone, code }` → creates User(Customer) if new, returns `{ accessToken, refreshToken, user }`. 5 wrong attempts invalidates the code.
- `POST /staff/login { fleetSlug, email, password }` → for Driver/Dispatcher/FleetAdmin. Argon2id or BCrypt hashing.
- `POST /refresh { refreshToken }` → rotates token. Old token revoked.
- `POST /logout`.
- JWT claims: `sub`, `role`, `fleet_id`, `fleet_slug`, `name`.
- Policies as in context §9.

### 5. Order state machine
- `OrderStateMachine.Apply(Order order, OrderTransition transition, Actor actor, object? payload)` — validates, mutates order, returns the `OrderEvent` to persist.
- Unit tests covering every allowed and at least 10 disallowed transitions.
- `OrderService` wraps: load order (with `Version` check), apply transition, save order + event in one transaction, then publish `OrderChanged` via `IRealtimePublisher`.

### 6. Order endpoints (backend only, used by 02/03/04)
Under `/api/v1/orders`:
- `POST /` create (Dispatcher or Customer). Validates addresses have coordinates, phone is E.164, `scheduledAt` is in the future if present.
- `GET /` list with filters: `status[]`, `driverId`, `from`, `to`, `search` (public code / phone / name). Dispatcher only.
- `GET /{id}` — Dispatcher; Driver if assigned; Customer if owner.
- `GET /by-code/{publicCode}` — public tracking, returns a **reduced DTO** (status, driver first name, vehicle plate/color, ETA, position) — requires either customer JWT owning it or a signed tracking token (see 05).
- `POST /{id}/assign { driverId }`, `/reassign { driverId }`, `/accept`, `/decline { reason }`, `/arrive`, `/start`, `/complete { finalPriceCzk, paymentType, overrideReason? }`, `/cancel { reason }`.
- `POST /{id}/notes { text }`.
- `GET /{id}/events` — Dispatcher.

### 7. Driver & vehicle endpoints
- `/api/v1/drivers`: list (dispatcher), `POST /me/online { vehicleId }`, `POST /me/offline`, `GET /me`.
- `/api/v1/vehicles`: CRUD (FleetAdmin).
- `/api/v1/staff`: CRUD users of role Driver/Dispatcher (FleetAdmin). Invite = create with temporary password returned once.

### 8. SignalR hub
- `/hubs/fleet` per context §10. JWT via query string `access_token` (SignalR standard).
- `UpdatePosition` updates `Driver.LastLat/Lng/PositionAt` in memory store (`ConcurrentDictionary`) and flushes to DB every 30 s per driver; broadcasts immediately.
- On connect: dispatchers join `fleet:{fleetId}:dispatch`; drivers join `driver:{driverId}`.
- `IRealtimePublisher` abstraction so services never reference the hub directly.

### 9. Background jobs (`IHostedService`)
- `OfferTimeoutJob`: every 5 s, finds `Assigned` orders older than `OfferTimeoutSeconds` without acceptance → transition `Timeout` back to `New`, notify dispatch group.
- `StalePositionJob`: every 60 s, drivers with `LastPositionAt` older than 5 min and status != Offline → mark `Offline`, write DriverShift end, notify.
- Job scheduling must survive restarts (state lives in DB, not memory).

### 10. Seed data (Development only)
Fleet `demo` ("Taxi Demo Kolín"), 1 FleetAdmin (`admin@demo.local` / `Demo1234!`), 1 Dispatcher, 3 Drivers, 3 Vehicles, 1 default Tariff (base 40, per km 28, waiting 5/min, minimum 100), 2 Zones (Kutná Hora circle r=4 km, Kolín circle r=4 km), 3 Routes (station→center 100, anywhere KH 110, KH→Kolín 300), 5 sample Orders in various states.

### 11. Tests
- Testcontainers Postgres fixture shared across tests.
- `WebApplicationFactory` with helpers `AsDispatcher(fleet)`, `AsDriver(driver)`, `AsCustomer(phone)`.
- Minimum: every endpoint has one happy-path test; tenant isolation test per tenant table; state machine unit tests; auth rate-limit test; concurrency test (two dispatchers assign the same order → one gets 409).

## Acceptance criteria

1. `docker compose -f infra/docker-compose.dev.yml up` starts API + Postgres; `/health/ready` returns 200; Swagger lists all endpoints.
2. Seeded dispatcher can log in, create an order, assign a driver; seeded driver can accept, arrive, start, complete. Events are recorded in order.
3. A dispatcher of fleet A gets 404 (not 403 — do not leak existence) for an order of fleet B.
4. Driver `UpdatePosition` at 10 Hz is throttled to ≤ 1 per 3 s and reaches a connected dispatcher client (prove with a test SignalR client).
5. Killing and restarting the API does not lose an `Assigned` order's timeout (it still times out at the right time).
6. `/docs/api.md` generated and committed; `/docs/decisions.md` lists your decisions.
