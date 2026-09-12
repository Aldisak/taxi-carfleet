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

---

## 2026-09-11 — Frontend styling: styled-components (replaces Tailwind)

User decision at the UC-002 interview: the dispatcher web app (and all future `/web` code) uses **styled-components** instead of the Tailwind CSS named in the original context §4. Rationale: user preference for the CSS-in-JS approach. Caveat recorded: styled-components entered maintenance mode in 2025 — accepted; it remains stable and widely deployed. `00-PROJECT-CONTEXT.md` §4 updated. Everything else in the frontend stack is unchanged (React 18 + TS + Vite, React Router 6, TanStack Query, Zustand only for tiny cross-cutting state, Leaflet + OSM, i18next Czech-first, Vitest + Playwright).

## 2026-09-11 — UC-002 frontend quality gate

Phase 5 blocking gates for `/web`: `tsc --noEmit`, `eslint --max-warnings 0`, `vitest run`, `playwright test` (create→assign flow, AC #1, against the real API + seeded data). Backend gates (`dotnet build -warnaserror` / `dotnet test` / format) continue to apply to `/api` in the same run since UC-002 adds backend endpoints.

---

## 2026-09-12 — UC-002 implementation assumptions (B11, echoed from dispatcher-web-work-items.md)

Fourteen assumptions resolved where `002_UC_002_dispatcher-web.md` was silent or self-contradictory. Echoed here per DoD #6.

1. **Lane A touches zero shared `Program.cs`.** `AddFeatureConfigurations` in `Program.cs` auto-discovers all `IFeatureConfiguration` implementations via reflection. Lane A geo/route/override WIs register their services inside their own `FeatureConfiguration.AddFeatureDependencies` — no `Program.cs` edits. A1→A2→A3 are serialized (all append to `ErrorCodes.cs`); A4 and A5 run in parallel.

2. **`geo/suggest` fails soft; `geo/route` fails hard-but-typed.** `GET /geo/suggest` returns 200 + empty list on upstream failure. `GET /geo/route` returns 502 with code `Geo.RouteUnavailable`. Client renders no price estimate and order creation still proceeds.

3. **Suggest provider = Photon; route provider = OSRM public.** Base URLs are config keys (`Geo:SuggestBaseUrl`, `Geo:RouteBaseUrl`) for self-hosting.

4. **Geo suggest has no tenant-isolation test; geo route does (F-03).** `GET /geo/route` loads the caller's fleet default `Tariff` (tenant-filtered) for server-side price estimation.

5. **`OrderEventType.Updated` added as enum member.** String-stored — no migration needed. PATCH writes one `Updated` event.

6. **PATCH concurrency is client-version-aware.** Client sends the `version` it loaded; endpoint compares before write. Mismatch → 409 `Order.StaleVersion`. Non-editable status → 409 `Order.NotEditable`.

6a. **(F-01) `Order.Version` exposed in frontend-visible DTOs.** Added to `OrderDetailDto` (both `OrderDetailMapper.ToDto` and `GetOrderEndpoint`) and `OrderChangedDto`. `OrderSummaryDto` stays lean.

6b. **(F-02) `GET /drivers` exposes `lastLat`/`lastLng`.** Added to `DriverSummaryDto` projection in `ListDriversEndpoint`. `lastPositionAt` was already present.

7. **Driver status override supersedes decisions.md assumption #9 (AuditLog).** This UC writes the first `AuditLog` row (`Entity="Driver"`, `Action="StatusOverride"`). Override changes `Driver.Status` only — never touches `Order.Status`. This flag is intentionally retained.

8. **Override semantics — truthful fallback.** Dispatcher may force Free/Busy/Offline regardless of active order. Forcing Offline mirrors `GoOfflineEndpoint`: `Status=Offline`, `CurrentVehicleId=null`, close open `DriverShift`.

9. **A minimal fleet-settings read endpoint IS added (A5).** `GET /fleet/settings` (FleetAdminOnly) — combined read from `Fleet` + `FleetSettings`. No write endpoint (v1.1).

10. **Pinned frontend versions for Node 20.0.0.** `eslint@8.57.1` and `typescript-eslint@7.18.0` (NOT v8/v9) due to engines `^20.9.0` constraint on newer versions. `@playwright/test@1.48.2` pinned to match the conductor's pre-fetched Chromium.

11. **AC#7 (cs/en completeness) is mechanized.** `locales.parity.test.ts` vitest asserts identical key sets in cs.json and en.json on every WI.

12. **AC#8 (Lighthouse a11y ≥ 90) is best-effort.** Measured manually via `npx lighthouse http://localhost:5173/x`; documented in `DEMO.md`. Non-blocking gate.

13. **`docs/api.md` regenerates via full `dotnet test`.** `OpenApi_Document_GeneratesApiMarkdown` test regenerates on every suite run — not per-WI.

14. **(F-05a) Customer name auto-fill from past orders DEFERRED to UC-006.** No "orders by phone" query endpoint exists; none is added here. The New order form's Name field is a plain manual input.

---

## 2026-09-12 — Frontend agent split: backend-developer + frontend-developer

User decision: the pipeline's single `developer` agent is split into **`backend-developer`** (lane `"api"`, model sonnet) and **`frontend-developer`** (lane `"web"`, model sonnet per user choice), routed by each WI's `lane` field. Supporting changes:

- Six auto-injected frontend rules added: `rules/web-architecture.md`, `web-react-style.md`, `web-performance.md`, `web-realtime.md`, `web-accessibility.md`, `web-testing.md`. Designer cites their anchors on web WIs (never C# rules on a web WI and vice versa); design-reviewer and impl-reviewer gained web checklists.
- `verification.tool` enum formalized: `dotnet-test | dotnet-build | vitest | npm-lint | npm-tsc | npm-build | playwright`. vitest `filter` is a file-path substring constrained to `^[A-Za-z0-9][A-Za-z0-9._/-]*$` (max 200).
- Conductor Phase 5 is stack-aware; the web gate is `npm run --prefix web lint / tsc / test / build / size` (all blocking) + `e2e` (blocking when web flows changed, waivable at Gate E).
- Web tooling adopted: `eslint-plugin-jsx-a11y` (blocking via `--max-warnings 0`; zero violations in existing code at adoption), `vitest-axe` + `axe-core` (via the preconfigured `src/shared/test/axe.ts` helper — color-contrast disabled in jsdom), `size-limit`+`@size-limit/file` **pinned ^11.2.0** (v12+/13 require Node ≥22; repo pins Node 20.0.0), `web-vitals` (dev console sink; backend sink in assignment 07), `@tanstack/react-virtual` (installed; used only past the ~100-row threshold).
- **Bundle budget: 260 KB (brotli) provisional** in `web/package.json` `"size-limit"` — measured 184 KB mid-UC-003 with headroom for the driver PWA lane. Ratchet down after UC-003 ships and role-group code-splitting (`rules/web-performance.md#code-splitting`) lands.
- **Compatibility shim:** the change landed while a UC-003 conductor session was live mid-implementation (developer handoffs laneA3/B3a/B3b already written). `.claude/agents/developer.md` is kept as a verbatim deprecated alias so the live session's `developer` dispatches keep working, and impl-reviewer accepts the legacy `handoff-developer-{wi_id}.json` filename. **Cleanup after UC-003 ships:** delete the shim file and the legacy-fallback clause in `impl-reviewer.md`.

---

## 2026-09-12 — UC-003 implementation assumptions + AC#3 push deferral (DoD #6)

Echoed per UC-003 Definition-of-Done #6. These resolve where the driver-PWA spec was silent or where a UC-003 half is intentionally out of scope.

1. **AC#3 is split; the Web Push (background) half is DEFERRED to assignment 05.** The spec's AC#3 ("a new order reaches the driver within ~2 s") has two halves: (a) **foreground** — the full-screen offer takeover rendered from the `NewOrderOffered` SignalR event while the PWA is open; and (b) **background push** — a Web Push notification that wakes a backgrounded or closed PWA. Half (a) ships in this UC (B-offer) and is proven by the `Driver_FullFlow_…` E2E. Half (b) requires a backend push-subscription store + VAPID send pipeline that is **assignment 05 (notifications)** scope, not UC-003. The PWA's `PermissionPriming` primes the notification permission, but no server-side push is sent in v1. DEMO.md §12 documents the manual foreground check and the deferral.

2. **AC#1 installability is a MANUAL acceptance step with no automated home.** `VitePWA` runs with `devOptions.enabled: false`, so the service worker and manifest never register under `npm run dev` — which is exactly what the Playwright harness boots — so E2E cannot observe them. Installability is therefore verified manually against a production build (`npm run build && npx vite preview` → Chrome DevTools Application panel / Lighthouse PWA, including the maskable-icon audit) and recorded in DEMO.md §11. This is the one binding AC with a manual-only verification; the manual step is its assigned verification, not a gap.

3. **Driver specs drive AC#2 from the ONLINE precondition (documented B-home gap, not a test hack).** The driver home vehicle selector is populated **only** from `GET /drivers/me`'s `currentVehicleId`, and `POST /drivers/me/offline` nulls `current_vehicle_id`; there is no driver-facing vehicle-list endpoint. Consequently an Offline driver cannot select a vehicle to start a shift through the UI (and no seeded driver is Offline-with-vehicle). The `Driver_FullFlow_…` spec therefore keeps the seeded test driver (driver2) online via the API and drives the UI flow from there — offer → accept → arrive → start → complete(fixed) → Home totals — which proves the substance of AC#2 through the real UI. The "select vehicle → start shift" sub-step is a B-home limitation to route back to B-home; it is **not** worked around by DB-fabricating an unreachable Offline-with-vehicle state (that would assert a flow no real user can reach).

4. **AC#5 exactly-once is proven via the dispatcher event feed.** The offline-queue spec taps "Jsem na místě" while `context.setOffline(true)` (item queued, "čeká na odeslání" shown), then `setOffline(false)` replays it. Exactly-once is asserted by counting `Arrived`-type events on `GET /orders/{id}/events` (dispatcher token) == 1 — the `X-Idempotency-Key` is minted once at enqueue time (B-queue) and the server idempotency layer (A-idem) dedupes the replay. The queue's reconnect drain fires from `DriverQueueBar`'s `useQueueReplayOnReconnect` on the `connected` transition.

5. **Two Playwright projects, one harness.** A second `mobile-driver` project (Pixel 5, `geolocation` granted) with `testMatch: /driver\.spec\.ts/` is added alongside the existing Desktop `chromium` project, which gains `testIgnore: /driver\.spec\.ts/` so `dispatcher.spec.ts` stays desktop-only. Both projects reuse the single `webServer` array unchanged. `chromium` is listed first so the dispatcher flows run before the driver flows over the shared seeded DB.

6. **`docs/api.md` regenerates via the full `dotnet test`** (the `OpenApi_Document_GeneratesApiMarkdown` test), not hand-edited in this WI.

---

## 2026-09-12 — UC-004 customer-PWA implementation assumptions (DoD #6)

Echoed per UC-004 Definition-of-Done #6. These resolve where the customer-PWA spec was silent or
where a half is intentionally out of scope pre-05/06.

1. **`routes/common` was made `AllowAnonymous` (AC#1 needs it), alongside the Anonymous `public/fleet`
   + `public/track`.** The Home common-route cards come from `GET routes/common?validNow=true`. For a
   logged-out visitor to order in ≤3 taps *before* any login (AC#1), this read-only listing is
   `AllowAnonymous` (verified in `ListCommonRoutesEndpoint.Configure`), with the fleet resolved by
   `TenantResolutionMiddleware` from `X-Fleet-Slug`/subdomain — the EF global query filter auto-scopes
   the read (no cross-fleet leak), and no fleet resolved → 404. This mirrors the branding endpoint
   `GET public/fleet` and the SMS tracking endpoint `GET public/track/{code}?k=`. `geo/suggest` and
   `pricing/quote` stay CustomerOnly — only this listing + the two `public/*` endpoints are public.
   On localhost the slug resolves to `demo`, so the seeded "Nádraží → Centrum" card is visible to the
   logged-out AC#1 flow.

2. **Tracking-token scheme = HMAC, validation-time expiry.** A-track's `TrackingTokenService` mints
   `Base64Url(HMACSHA256(Tracking:HmacKey, "{orderId}:{expUnixSeconds}"))`. A token is accepted when
   the signature verifies AND `now < exp` AND (if the order is Completed) `now < CompletedAt + 2h` —
   the "2h after completion" rule is a **validation-time** check, not a mint-time expiry (completion
   is unknown at mint). A bad/missing/expired/tampered token or an orderId-mismatch → **410
   Tracking.LinkExpired**; an unknown code → 404 (no leak). The customer create-order response carries
   `trackingCode`/`trackingToken`/`trackingUrlPath` so the E2E builds valid+tampered links without
   SMS. The dev `Tracking:HmacKey` is a seeded default and **must be set per-environment in
   production** (flagged for assignment 08 infra).

3. **Pricing is an estimate RANGE until assignment 06.** `GET pricing/quote` (CustomerOnly) returns
   a **fixed** price on a route match, else an **estimate band** = tariff price ±10 % rounded to
   10 CZK — never a single exact estimate (AC #4). Real route-matching geometry / OSRM distance is
   assignment 06; pre-06 the band derives from the default Tariff. The client renders Estimates as
   "Odhad {low}–{high} Kč" (proven in `priceQuote.test.ts`; the E2E asserts the UI shows two numbers,
   never one).

4. **Push SENDING deferred to assignment 05.** The tracking screen's push-subscription prompt asks
   only for the browser **permission** (client-side); there is no server-side Web Push send in this
   UC. The backend push-subscription store + VAPID pipeline is assignment 05 (notifications) scope.

5. **ETA-minute count deferred to assignment 06.** `TrackDto.etaMinutes` is always null pre-06 (OSRM
   ETA is assignment 06), so the Assigned/Accepted headline is "Řidič {name} je na cestě" (no
   "~{eta} min"). The B-e2e AC#2 assertion targets the headline **state change**, not a minute number.

6. **Reverse-geocode is a client stub.** `IGeoProvider` has `SuggestAsync` + `RouteAsync` only; there
   is no reverse-geocode. "Použít moji polohu" drops a GPS pin labeled "Moje poloha (GPS)" (no street
   name) with a map-drag fallback. A backend reverse-geocode is deferred to 06.

7. **Additive schema.** `Fleet.PrimaryColorHex` (nullable `#RRGGBB`) was added (Fleet had no color
   column) with migration `AddFleetPrimaryColor`; null → the client theme-token fallback.
   `Order.RatingStars/RatingComment/RatedAt` were added with migration `AddOrderRating` (sequenced
   after `AddFleetPrimaryColor`). `common-routes-valid-now` is built from the **existing** Route
   entity (Name/Type/PriceCzk/ValidDays bitmask/ValidFromTime/ValidToTime/IsEnabled/DeletedAt), not a
   stub; full route/zone *management* stays in assignment 06. An `orders/mine` history listing (paged
   `{ items, total, page, pageSize }`) + `orders/mine/active` were added under one `Orders.Mine` test
   namespace.

8. **Three Playwright projects, one harness.** A `mobile-customer` project (Pixel 5,
   `testMatch: /customer\.spec\.ts/`) is added alongside `chromium` (dispatcher,
   `testIgnore: [/driver\.spec\.ts/, /customer\.spec\.ts/]`) and `mobile-driver` (driver). All three
   reuse the single `webServer` array unchanged. Tap-count for AC#1 is asserted as the **real** 2
   taps the app produces (see DEMO.md §14 for the "3-tap" reconciliation).

9. **AC#2 car-marker is asserted as RENDERED at a sent position, not a two-point move.** A single
   driver `UpdatePosition` over SignalR (the accepted driver) renders the marker; a deterministic
   second move is flaky (server throttles ≤1/3 s; initial marker null), so movement is not
   synthesized. Documented honestly in DEMO.md §14.

10. **`docs/api.md` regenerates via the full `dotnet test`** (the OpenAPI document test), not
    hand-edited in this WI.
