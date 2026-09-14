# Developer Guide

A short, browser-first guide to running the app locally and watching an order flow through the whole system.

> For the API/`curl` walkthrough and the Playwright e2e suite, see [`docs/DEMO.md`](./DEMO.md).

## What this is

A multi-tenant taxi fleet system:

- **one .NET 10 API** (`api/`) + **one PostgreSQL database**,
- **one React app** (`web/`) that serves three role-based clients from the same origin:
  - **Dispatcher** at `/dispatcher`,
  - **Driver PWA** at `/driver`,
  - **Customer PWA** at `/customer`.

Realtime updates flow over a single SignalR hub (`/hubs/fleet`), so orders appear and move on every screen without a refresh.

## Prerequisites

- **Docker Desktop** running.

That's all you need for the steps below. (Node 20+ and the .NET 10 SDK are only needed if you want the hot-reload hybrid workflow or to run the test suites — see `docs/DEMO.md`.)

## Run it

From the repo root:

```bash
docker compose -f infra/docker-compose.dev.yml up
```

This boots three containers:

| Service | What | URL |
|---------|------|-----|
| `db`  | PostgreSQL 16 | `localhost:5432` |
| `api` | .NET 10 API (hot-reload via `dotnet watch`) | `http://localhost:5249` |
| `web` | Vite dev server (React app) | `http://localhost:5173` |

On the **first** start the API automatically applies EF Core migrations and **seeds the demo fleet** (idempotent — it's keyed on the fleet slug `demo`, so later starts skip seeding).

Quick checks:

- Health: `curl http://localhost:5249/health/ready` → `200 OK`
- Swagger (Development only): open `http://localhost:5249/swagger`
- The app: open `http://localhost:5173`

Stop it / reset the database:

```bash
docker compose -f infra/docker-compose.dev.yml down      # stop
docker compose -f infra/docker-compose.dev.yml down -v   # stop + wipe the DB (re-seeds on next up)
```

> **SMS in dev is console-only** (`Notifications__SmsProvider=Console`) — no real texts are sent. This matters for customer login below.

## Demo logins

All seeded staff share the fleet slug **`demo`** and the password **`Demo1234!`**:

| Role | Email | Login page |
|------|-------|-----------|
| Fleet admin | `admin@demo.local` | `http://localhost:5173/dispatcher/login` |
| Dispatcher | `dispatcher@demo.local` | `http://localhost:5173/dispatcher/login` |
| Driver 1 — Jan Novák | `driver1@demo.local` | `http://localhost:5173/driver/login` |
| Driver 2 — Petr Svoboda | `driver2@demo.local` | `http://localhost:5173/driver/login` |
| Driver 3 — Karel Dvořák | `driver3@demo.local` | `http://localhost:5173/driver/login` |

Source of truth for the seed data: `api/src/Taxi.Api/Infrastructure/Seed/DevelopmentSeeder.cs`.

## Access the customer view

Open the customer PWA:

```
http://localhost:5173/customer
```

On localhost the fleet slug defaults to `demo` (you can also be explicit with `?fleet=demo`).

Customers log in with a **phone number + a 6-digit SMS code** — there's no email/password. The two steps are:

1. Enter a phone number (e.g. `+420777123456`) and tap **"Odeslat kód"** (Send code).
2. Enter the 6-digit code in the **"Ověřovací kód"** (Verification code) field.

### Getting the code in dev (important)

In development the SMS code is **random, hashed, and never printed anywhere** — you can't read it from the console or logs, and there is no fixed "dev code". So we use the same trick the e2e tests use: create the code row by tapping "Odeslat kód", then overwrite it in the database with a **known code, `424242`**.

After you've tapped "Odeslat kód" (this creates the row), run this from the repo root — **replace the phone with the exact number you typed**:

```bash
docker compose -f infra/docker-compose.dev.yml exec -T db \
  psql -U taxi -d taxi -c \
  "UPDATE sms_codes SET code_hash='833dfc7e3eb11230369904322cc8481b2b9a166d965557f97d4832cd92e072af', attempts=0, used_at=NULL WHERE id=(SELECT id FROM sms_codes WHERE phone='+420777123456' AND used_at IS NULL ORDER BY expires_at DESC LIMIT 1);"
```

(`833dfc7e…072af` is just the SHA-256 of `424242`.) Now type **`424242`** in the "Ověřovací kód" field — it auto-submits on the 6th digit and logs you in.

> **Rate limits:** one code per phone per 60 seconds, three per 10 minutes. If you're re-testing, use a fresh phone number to avoid hitting them.

## Follow an order through the system

Have the stack running. The cleanest setup is **three separate browser windows** (use incognito/separate profiles so the sessions don't collide — a real phone works nicely for `/driver`):

**a) Customer places an order** — in the `/customer` window, log in (above), then place an order (pickup, dropoff, passengers). The order is created with status **New**.

**b) It appears on the dispatcher board** — open `http://localhost:5173/dispatcher/login`, log in as `dispatcher@demo.local`. The new order shows up **live** in the **"Nové"** (New) column — no refresh (that's the SignalR hub at work).

**c) Dispatcher assigns a driver** — click the order, pick a free driver (e.g. **Jan Novák**), and click **"Přiřadit"** (Assign). The order becomes **Assigned** and moves out of "Nové". The driver gets an offer.

**d) Driver runs the ride** — in the `/driver` window, log in as `driver1@demo.local`, go online. A full-screen **offer** appears; tap **"Přijmout"** (Accept). Then walk the ride buttons:

- **Accept** → status **Accepted** ("Řidič je na cestě")
- **"Jsem na místě"** (I've arrived) → **Arrived**
- **"Zahájit jízdu"** (Start ride) → **InProgress**
- **"Ukončit jízdu"** (Complete) → enter final price + payment type → **Completed**

**e) Everyone updates live** — throughout, the **customer's tracking screen** and the **dispatcher board** update at each step with no reload: `Accepted → Arrived → InProgress → Completed`.

## Order lifecycle reference

Statuses: **New → Assigned → Accepted → Arrived → InProgress → Completed** (plus **Cancelled**).

| Transition | From → To | Who triggers it | Endpoint |
|------------|-----------|-----------------|----------|
| Create | — → New | Customer / Dispatcher | `POST /orders` |
| Assign | New → Assigned | Dispatcher | `POST /orders/{id}/assign` |
| Accept | Assigned → Accepted | Driver | `POST /orders/{id}/accept` |
| Decline | Assigned → New | Driver | `POST /orders/{id}/decline` |
| Timeout | Assigned → New | System (offer times out, seeded 45 s) | background job |
| Arrive | Accepted → Arrived | Driver | `POST /orders/{id}/arrive` |
| Start | Arrived → InProgress | Driver | `POST /orders/{id}/start` |
| Complete | InProgress → Completed | Driver | `POST /orders/{id}/complete` |
| Cancel | New/Assigned/Accepted/Arrived → Cancelled | Dispatcher / Customer / Driver (no-show) | `POST /orders/{id}/cancel` |
| Reassign | Assigned/Accepted/Arrived → Assigned | Dispatcher | `POST /orders/{id}/reassign` |

Source of truth: `api/src/Taxi.Api/Common/Orders/OrderStateMachine.cs`.

## Shortcut: pre-seeded orders

You don't have to create an order to see a populated board — the demo fleet seeds five orders spanning the lifecycle, so the dispatcher board is non-empty on first login:

| Code | Status |
|------|--------|
| DEMO01 | New |
| DEMO02 | Assigned (Jan Novák) |
| DEMO03 | Accepted (Petr Svoboda) |
| DEMO04 | InProgress (Karel Dvořák) |
| DEMO05 | Completed (Jan Novák) |

## Pointers

- **API / `curl` walkthrough + Playwright e2e:** [`docs/DEMO.md`](./DEMO.md)
- **Seed data (fleet, users, vehicles, orders):** `api/src/Taxi.Api/Infrastructure/Seed/DevelopmentSeeder.cs`
- **Order state machine:** `api/src/Taxi.Api/Common/Orders/OrderStateMachine.cs`
- **Web routes / client boundaries:** `web/src/app/router.tsx`
- **Realtime broadcasting:** `api/src/Taxi.Api/Realtime/SignalRRealtimePublisher.cs`
