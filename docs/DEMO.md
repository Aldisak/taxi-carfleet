# Demo — Manual Smoke Test

This document walks through starting the stack with Docker Compose and exercising the seeded demo fleet.

## Prerequisites

- Docker Desktop running
- `curl` available (or Postman, HTTPie, etc.)

## 1. Start the stack

```bash
docker compose -f infra/docker-compose.dev.yml up
```

The compose file starts:
- `db` — PostgreSQL 16 on port 5432
- `api` — .NET 10 Taxi API on port 8080 (Development environment)

On first start the API applies EF Core migrations and seeds the demo fleet automatically.

## 2. Verify health

```bash
curl http://localhost:8080/health/ready
# → HTTP 200 OK
```

## 3. Browse Swagger (Development only)

Open in your browser:

```
http://localhost:8080/swagger
```

All ~35 endpoints should appear grouped by feature tag.

## 4. Login as demo dispatcher

```bash
curl -s -X POST http://localhost:8080/api/v1/auth/staff/login \
  -H "Content-Type: application/json" \
  -d '{"fleetSlug":"demo","email":"dispatcher@demo.local","password":"Demo1234!"}' \
  | jq .
```

Copy the `accessToken` value.

## 5. Login as demo admin

```bash
curl -s -X POST http://localhost:8080/api/v1/auth/staff/login \
  -H "Content-Type: application/json" \
  -d '{"fleetSlug":"demo","email":"admin@demo.local","password":"Demo1234!"}' \
  | jq .
```

## 6. End-to-end order flow

Set your dispatcher token:

```bash
DISPATCHER_TOKEN="<paste accessToken here>"
```

### Create an order

```bash
curl -s -X POST http://localhost:8080/api/v1/orders \
  -H "Authorization: Bearer $DISPATCHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerPhone": "+420777123456",
    "customerName": "Jan Zákazník",
    "pickupAddress": "Náměstí Republiky, Kolín",
    "pickupLat": 50.0281,
    "pickupLng": 15.2006,
    "dropoffAddress": "Kutná Hora centrum",
    "dropoffLat": 49.9481,
    "dropoffLng": 15.2681,
    "passengers": 1,
    "priceType": "Estimate"
  }' | jq .
```

Copy the returned `order.id`.

### List drivers and find driver1

```bash
curl -s http://localhost:8080/api/v1/drivers \
  -H "Authorization: Bearer $DISPATCHER_TOKEN" | jq .
```

Find driver1's `id` (`driver1@demo.local / Jan Novák`). Copy it.

### Assign driver1 to the order

```bash
ORDER_ID="<order id>"
DRIVER_ID="<driver1 id>"

curl -s -X POST "http://localhost:8080/api/v1/orders/$ORDER_ID/assign" \
  -H "Authorization: Bearer $DISPATCHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"driverId\":\"$DRIVER_ID\"}" | jq .
```

### Login as driver1 and accept the order

```bash
DRIVER1_TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/staff/login \
  -H "Content-Type: application/json" \
  -d '{"fleetSlug":"demo","email":"driver1@demo.local","password":"Demo1234!"}' \
  | jq -r .accessToken)

curl -s -X POST "http://localhost:8080/api/v1/orders/$ORDER_ID/accept" \
  -H "Authorization: Bearer $DRIVER1_TOKEN" | jq .

curl -s -X POST "http://localhost:8080/api/v1/orders/$ORDER_ID/arrive" \
  -H "Authorization: Bearer $DRIVER1_TOKEN" | jq .

curl -s -X POST "http://localhost:8080/api/v1/orders/$ORDER_ID/start" \
  -H "Authorization: Bearer $DRIVER1_TOKEN" | jq .

curl -s -X POST "http://localhost:8080/api/v1/orders/$ORDER_ID/complete" \
  -H "Authorization: Bearer $DRIVER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"finalPriceCzk":250,"paymentType":"Cash"}' | jq .
```

### Verify events

```bash
curl -s "http://localhost:8080/api/v1/orders/$ORDER_ID/events" \
  -H "Authorization: Bearer $DISPATCHER_TOKEN" | jq '.events[].type'
# → "Created", "Assigned", "Accepted", "Arrived", "Started", "Completed"
```

## 7. Pre-seeded demo data

The demo fleet is automatically seeded on first start with:

| Resource | Count | Details |
|----------|-------|---------|
| Fleet admin | 1 | `admin@demo.local` / `Demo1234!` |
| Dispatcher | 1 | `dispatcher@demo.local` / `Demo1234!` |
| Drivers | 3 | `driver1@demo.local`, `driver2@demo.local`, `driver3@demo.local` — all `Demo1234!` |
| Vehicles | 3 | Škoda Octavia, VW Passat, Toyota Corolla |
| Tariff | 1 | Base 40 CZK, per-km 28 CZK, waiting 5 CZK/min, minimum 100 CZK |
| Zones | 2 | Kutná Hora (circle r=4 km), Kolín (circle r=4 km) |
| Routes | 3 | Station→Centre (100 CZK), Anywhere→KH (110 CZK), KH→Kolín (300 CZK) |
| Sample orders | 5 | DEMO01 (New), DEMO02 (Assigned), DEMO03 (Accepted), DEMO04 (InProgress), DEMO05 (Completed) |

## 8. SignalR real-time hub

Connect to `/hubs/fleet?access_token=<token>` with a WebSocket client. Dispatchers receive `OrderChanged` and `DriverStatusChanged` events. Drivers send `UpdatePosition` calls (throttled server-side to 1/3s).

## 9. Playwright E2E suite (`npm run e2e`)

The E2E suite runs two tests against the real API + Postgres + seed stack and proves the two core acceptance criteria of UC-002:

| Test | Acceptance Criterion |
|------|---------------------|
| `AC1_CreateAndAssign` | Create an order in ≤6 UI interactions + assign to a free driver (AC#1) |
| `AC2_RealtimeCardMove` | Driver accept via API moves card to "Probíhající" within 1 s (AC#2) |

### Prerequisites

- Docker Desktop running.
- Node 20+ and dotnet SDK 10 (at `C:\Users\alesm\AppData\Local\Microsoft\dotnet\dotnet.exe`).
- `cd web && npx playwright install chromium` (once, to ensure the pinned Chromium binary is present).

### Run

```bash
cd web
npm run e2e
```

The harness automatically:
1. Tears down any previous DB volume (`docker compose down -v`) for determinism.
2. Starts only the `db` service from `infra/docker-compose.dev.yml`.
3. Waits for Postgres to be ready.
4. Runs `dotnet run` (SDK 10) in Development mode — applies EF migrations and seeds the demo fleet.
5. Starts the Vite dev server on port 5173.
6. Runs the two Playwright tests in Chromium.
7. Playwright automatically kills both server processes after the run.

### Interaction count for AC#1

The `AC1_CreateAndAssign` test uses exactly **5** scripted UI interactions (well within the ≤6 limit):

1. Fill phone number in the Phone field
2. Click quick chip "Vlakové nádraží Kolín" (fills pickup + coordinates)
3. Press Enter to submit (ASAP is the default — no toggle needed)
4. Click "Přiřadit" on the new order card
5. Click "Jan Novák" (driver1) in the driver picker

### Manual Lighthouse accessibility audit (AC#8 — best-effort, non-blocking)

With the stack running (`npm run dev` + API + DB), open Lighthouse in Chrome DevTools against the board:

```
http://localhost:5173/dispatcher
```

Target: **a11y score ≥ 90**. This is measured manually and documented here — it is not a blocking gate in the automated pipeline.

## Notes

- The `Seed:Enabled` setting defaults to `true` in Development. Set `Seed__Enabled=false` to skip seeding on subsequent starts (seeder is idempotent — it skips if the demo fleet exists).
- Swagger UI is only available in `Development` environment.
- JWT access tokens expire in 15 minutes; use `/auth/refresh` with the refresh token to rotate.

---

# UC-003 — Driver PWA (`/driver`)

The driver PWA is a mobile-first React client served at the `/driver/*` route group of the same Vite app. Login with a seeded driver (`driver1@demo.local` … `driver3@demo.local`, all `Demo1234!`).

## 10. Driver PWA Playwright E2E suite (`npm run e2e`, mobile project)

The E2E config has **two** Playwright projects that share the one `webServer` harness (docker db + `dotnet run` + Vite):

| Project | Spec | Viewport |
|---------|------|----------|
| `chromium` | `dispatcher.spec.ts` (UC-002) | Desktop Chrome |
| `mobile-driver` | `driver.spec.ts` (UC-003) | Pixel 5 (geolocation granted) |

The `chromium` project runs first (`testIgnore: /driver\.spec\.ts/`); the `mobile-driver` project runs the driver flows (`testMatch: /driver\.spec\.ts/`). `npm run e2e` runs both.

### Driver specs (UC-003)

| Test | Acceptance Criterion | Proof |
|------|---------------------|-------|
| `Driver_FullFlow_StartShiftToCompleteFixed_ShowsTotals` | AC#2 (+ AC#3 foreground half) | offer takeover appears ≤2 s after assign → Přijmout → Jsem na místě → Zahájit jízdu → Ukončit jízdu → complete with the locked fixed price → Home shows 1 ride and the cash total equals the fixed price |
| `Driver_Decline_ReturnsOrderToNew` | AC#4 | Odmítnout requires a reason; after decline the order returns to `New` (dispatcher-visible) and its driver is cleared |
| `Driver_OfflineArrive_QueuedThenDeliveredExactlyOnce` | AC#5 | `context.setOffline(true)` around "Jsem na místě" shows "čeká na odeslání"; `setOffline(false)` replays it and the server records **exactly one** `Arrived` event (via `X-Idempotency-Key` + server idempotency, A-idem) |

Seeded driver used by the specs: **driver2 / Petr Svoboda** (zero completed rides at seed time → a clean totals baseline; driver1 is consumed by the dispatcher spec).

### Known limitation surfaced by AC#2 (start-shift from Offline)

The specs drive the AC#2 flow from the **online** precondition (driver2 kept Free via the API), not by clicking "Začít směnu". Reason: the home vehicle selector is built **only** from `GET /drivers/me`'s `currentVehicleId`, and `POST /drivers/me/offline` nulls that field — there is no driver-facing vehicle-list endpoint. So an offline driver cannot pick a vehicle to start a shift through the UI. The substantive heart of AC#2 (offer → accept → arrive → start → complete → totals) is proven end-to-end through the real UI; only the select-vehicle / start-shift precondition is set up via the API. This is a B-home gap, tracked in the B-e2e handoff `blocked_on`.

## 11. AC#1 — PWA installability (MANUAL)

Installability cannot be verified by the Playwright harness: `VitePWA` is configured with `devOptions.enabled: false`, so the service worker and Web App Manifest **never activate under `npm run dev`** (what the harness boots). Verify against a production build:

```bash
cd web
npm run build
npx vite preview          # serves the built app (with SW + manifest) on http://localhost:4173
```

Then in Chrome:

1. Open `http://localhost:4173/driver`.
2. DevTools → **Application** panel:
   - **Manifest**: name "Taxi Řidič", `display: standalone`, `theme_color` / `background_color` set, portrait orientation.
   - **Icons**: 192×192, 512×512, and a **maskable** 512 icon present (check the maskable icon renders inside the safe zone).
   - **Service Workers**: one registered, app-shell precache only; confirm `/api` and `/hubs` requests are **not** intercepted (Network tab → they go to the network, not the SW).
3. Run **Lighthouse → PWA category** against `/driver`: the "Installable" audit and maskable-icon audit should pass. Record the score here per DoD.
4. Use the address-bar install affordance (or the in-app install banner) to add the app to the home screen; confirm it launches standalone.

## 12. AC#3 — Push notifications (MANUAL; server half DEFERRED to assignment 05)

The **foreground** half of AC#3 (offer takeover within 2 s while the app is open) is covered automatically by `Driver_FullFlow_…` above. The **background push** half (Web Push so an offer wakes a backgrounded/closed PWA) is **deferred to assignment 05** — the backend push-subscription + VAPID send pipeline is not in this UC (see `docs/decisions.md`). Manual check of the foreground behaviour:

1. Boot the harness (section 9) or run `npm run dev` + API + DB.
2. Open `/driver` on a phone (or the Pixel 5 device toolbar), log in as a driver, and ensure the connection dot is green.
3. From a dispatcher session (or `curl`), create + assign an order to that driver.
4. The full-screen offer takeover should appear within ~2 s with sound/vibration (subject to the per-driver "Tichý režim" setting) while the app is in the foreground.

Background delivery (app closed / screen off) will be demoable after assignment 05 lands the push pipeline.

## 13. Booting the harness for manual driver testing

Same harness as the E2E suite (section 9):

```bash
cd web
node scripts/e2e-api.mjs     # docker db + dotnet run (Development, Seed__Enabled=true) on :5249
# in another shell:
npm run dev                  # Vite on :5173  → open http://localhost:5173/driver/login
```

## 14. UC-004 Customer PWA (/customer) — E2E + manual checks

The customer specs run on the `mobile-customer` Playwright project (Pixel 5) alongside the existing
`chromium` (dispatcher) and `mobile-driver` (driver) projects, reusing the one shared `webServer`
harness (docker db + `dotnet run` with `Seed__Enabled=true`, then Vite). Boot it exactly as in
section 13, then open `http://localhost:5173/customer` (localhost defaults the fleet slug to `demo`).

### Automated (customer.spec.ts)

- **AC#1 — 3-tap common route → Tracking** (`Customer_ThreeTapCommonRoute_ToTracking`): a logged-out
  visitor taps the "Nádraží → Centrum" card → "Objednat" → inline phone + dev code → lands on
  Tracking "Hledáme řidiče…".
  **STATUS — BLOCKED (web-client contract bug, NOT a test bug).** The logged-out Home renders **zero
  route cards** because `GET routes/common` returns `{ "routes": [...] }` (A-common-routes'
  `ListCommonRoutesResponse(Routes)`), but the web client types the response as `{ items }` and
  `useCommonRoutes.ts` reads `data.items` → always `[]` → `decideHomeContent` → empty Home. Verified
  from a Playwright trace: the call returns **200** with a body whose key is `routes`. The unit tests
  did not catch it because they mock the client module. The fix belongs to **B-home** (correct the
  `ListCommonRoutesResponse` type + `useCommonRoutes.ts` to read `routes`, plus a regression test that
  does **not** mock the client). Once fixed, this E2E should pass unchanged. The test is ordered LAST
  in `customer.spec.ts` so the `describe.serial` cascade does not skip AC#2/#3/#5/#7.
  **Tap-count reconciliation:** the assignment says "exactly 3 taps before the phone step". The
  *implemented* flow (B-home + B-route-order) produces **2 taps** before the phone input — the route
  card (which navigates straight to the preselected Confirm screen) and "Objednat" (which, logged
  out, reveals the inline login). There is no separate "Confirm" button: the card tap *is* the
  confirm. The spec asserts the real count (2). The marketing "3 taps" appears to count the later
  post-login "Objednat" as a third interaction; the order is still reachable in ≤3 taps total.
- **AC#2 — live headline + marker** (`Customer_LiveHeadlineAndMarker_OnAssignAccept`): dispatcher
  assigns + driver accepts via the API → the Tracking headline flips New → "Řidič … je na cestě"
  with **no reload** (OrderChanged → `order:{id}` group → cache invalidate → refetch). One driver
  `UpdatePosition` over SignalR (driver1 = the accepted driver) → the car marker renders at the sent
  coordinate.
  **Honest limitation:** the spec asserts the marker **renders at a sent position**, not a two-point
  *move*. A deterministic second move is flaky (the server throttles `UpdatePosition` to ≤1/3 s per
  driver and the initial marker is null until the first event), so movement is not synthesized. The
  ETA-minute count is **null pre-06** (OSRM ETA is assignment 06), so the headline omits "~min" and
  the assertion targets the headline *state change*, not a minute number.
- **AC#3 — valid vs expired link** (`Customer_PublicTrackingLink_ValidVsExpired`): a logged-out
  `/customer/t/{code}?k={token}` with the **valid** token (from the customer create-order response) renders
  the public tracking view; a **tampered** token → "Odkaz vypršel" + the Zavolat call button
  (public/track returns 410 Tracking.LinkExpired).
- **AC#5 — cancel in Accepted** (`Customer_CancelInAccepted_ReasonCustomer_DriverLosesOrder`): with
  the order Accepted, the customer cancels (confirm dialog shows the post-Accepted "Řidič už jede"
  hint) → the order becomes **Cancelled** with **CancelledByRole=Customer** (asserted from the DB
  row) and is no longer an active order for the driver (asserted via the dispatcher order list).
- **AC#7 — rating server-side** (`Customer_Rating_AfterCompleted_VisibleServerSide`): an order is
  driven to Completed, the customer POSTs a 5-star rating, and `rating_stars`/`rating_comment`
  persist (asserted from the DB row; the dispatcher order-detail also carries them).

**Dev SMS code:** the customer login code is random, SHA-256-hashed, and **never logged**
(`ConsoleSmsSender` masks the phone and logs no body). The E2E therefore injects a *known* code hash
directly into the `sms_codes` table via the `docker … psql` the harness already uses — a test-harness
technique, not an api/ change. A fresh phone is used per login to avoid the per-phone SMS rate limits.

### AC#6 — Lighthouse (MANUAL; mobile Perf ≥ 85, PWA installable, A11y ≥ 90)

Like the driver PWA, the `/customer` service worker + manifest only activate on a **production build**
(`devOptions.enabled: false`), so Lighthouse is a manual step against a preview build:

```bash
cd web
npm run build
npx vite preview                       # serves the built app (SW + manifest) on http://localhost:4173
npx lighthouse http://localhost:4173/customer --preset=desktop --only-categories=pwa,accessibility  # or mobile
```

In Chrome DevTools (mobile emulation) run **Lighthouse → Performance, Accessibility, PWA** against
`/customer`:

- **Performance ≥ 85** (mobile). The Home/shell chunk must not import Leaflet (it is lazy-loaded only
  inside the custom-order + tracking chunks), keeping the slow-3G budget.
- **Accessibility ≥ 90**. Czech labels on every control; 48×48 touch targets; the cancel dialog traps
  focus and closes on Escape.
- **PWA Installable** + maskable-icon audit pass; confirm `/api` and `/hubs` are not intercepted by
  the SW. Record the scores here per DoD #6.
