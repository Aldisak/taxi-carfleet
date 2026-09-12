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
http://localhost:5173/x
```

Target: **a11y score ≥ 90**. This is measured manually and documented here — it is not a blocking gate in the automated pipeline.

## Notes

- The `Seed:Enabled` setting defaults to `true` in Development. Set `Seed__Enabled=false` to skip seeding on subsequent starts (seeder is idempotent — it skips if the demo fleet exists).
- Swagger UI is only available in `Development` environment.
- JWT access tokens expire in 15 minutes; use `/auth/refresh` with the refresh token to rotate.
