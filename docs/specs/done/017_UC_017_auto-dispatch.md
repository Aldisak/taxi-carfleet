# Assignment 017 — Automatic driver dispatch (nearest-driver auto-assignment)

Read `00-PROJECT-CONTEXT.md` first. Requires 001 (backend core, orders, `OrderStateMachine`/`OrderService`), and the driver-position + offer-timeout machinery (`DriverPositionStore`, `OfferTimeoutJob`, `StalePositionJob`) merged. Backend-only (`/api`). Read the `taxi-order-state-machine` skill before touching order status.

## Why

Today an order created by a customer sits in `New` until a **dispatcher manually assigns** a driver. If no dispatcher is watching, the customer's "Looking for drivers…" state (UC-016) waits indefinitely. The offer machinery is half-built: `OfferTimeoutJob` reverts a stale `Assigned` offer back to `New` after `FleetSettings.OfferTimeoutSeconds`, and `FleetSettings` already carries `AutoDispatchEnabled`, `AutoDispatchAfterSeconds` (default 60), and `MaxOfferRadiusKm` (default 15) — but there is **no `AutoDispatchJob`** that actually offers a `New` order to the nearest eligible driver. This assignment adds it, closing the loop so orders get assigned automatically for fleets that opt in.

## Goal

For fleets with `AutoDispatchEnabled = true`, a background job automatically offers each eligible `New` order to the **nearest eligible online driver** within the fleet's radius, going through `OrderService`/`OrderStateMachine` (New → Assigned). If the offered driver declines or times out (existing `OfferTimeoutJob` reverts to `New`), auto-dispatch re-offers to the **next-nearest** driver not already tried for that order, until a driver accepts or the candidate pool is exhausted. Manual dispatcher assignment continues to work unchanged; auto-dispatch never overrides a human action.

## Scope

**In:** a new `AutoDispatchJob` (testable `RunTickAsync` + thin `PeriodicTimer` shell, mirroring `OfferTimeoutJob`/`StalePositionJob`); nearest-eligible-driver selection (haversine from pickup to driver last-known position, within `MaxOfferRadiusKm`, online/available, fresh position, not stale); an offer-exclusion mechanism so a driver who already declined/timed-out for an order is not re-offered the same order; per-fleet tenant-context handling; config gating on `AutoDispatchEnabled` (per fleet) and `AutoDispatchAfterSeconds`; DI registration; integration tests. All status changes go through `OrderService`/`OrderStateMachine` — never set `order.Status` directly.

**Out:** any change to the customer/dispatcher/driver UI (the frontend already reacts to `OrderChanged` — UC-016); changing the offer-timeout duration or the state machine's transition set; surge/priority/driver-rating-based selection (nearest-only for v1); scheduled-order pre-dispatch beyond the existing `ScheduledAt` handling; multi-offer/broadcast-to-many (this is sequential nearest-first, one offer at a time, consistent with `OfferTimeoutJob`).

## 1. The job (`api/src/Taxi.Api/Infrastructure/Jobs/AutoDispatchJob.cs`)

- Mirror the established job pattern (CLAUDE.md WI-14): `internal RunTickAsync(CancellationToken)` holds all per-tick logic; `ExecuteAsync` is a thin `PeriodicTimer → await RunTickAsync` shell. Integration tests construct the job and call `RunTickAsync` directly — deterministic, no timer waits.
- **Scan** (one scope, `IgnoreQueryFilters`) for candidate orders: status `New`, belonging to a fleet with `AutoDispatchEnabled = true`, and old enough per `AutoDispatchAfterSeconds` (`CreatedAt + AutoDispatchAfterSeconds <= now`, using the injected `TimeProvider`). Project `(OrderId, FleetId, PickupLat, PickupLng)`.
- **Per order**, in a **fresh scope** (mirror `OfferTimeoutJob`'s tenant handling — resolve the concrete `CurrentTenant`, set `FleetId = order.FleetId`, resolve `OrderService`): pick the nearest eligible driver and offer the order via `OrderService.TransitionAsync` (the New → Assigned/assign transition with the chosen `DriverId`). One scope per order so a poisoned change-tracker from one failure doesn't leak into the next.
- **Per-fleet `MaxOfferRadiusKm`** and `AutoDispatchAfterSeconds` are read from `FleetSettings` with the same `(int?)`-cast projection guard used in `OfferTimeoutJob` (a missing settings row must NOT default a radius/delay to 0). If `AutoDispatchEnabled` is false or no settings row exists, the order is skipped.

## 2. Nearest eligible driver

Define eligibility explicitly (a pure, tested helper where possible):
- Driver belongs to the order's fleet, is **online/available** (not `Offline`, not already on an active ride — reuse the same status semantics the board/`StalePositionJob` use), has a **fresh last-known position** (not stale per the `StalePositionJob` threshold), and is **within `MaxOfferRadiusKm`** of the pickup (haversine via the existing `Common/Geo/HaversineDistance.Meters`).
- **Exclude** drivers who have already been offered this order and declined or timed out — derive the exclusion set from the order's history (`order_events` rows for this order carrying a driver id for Assigned/Declined/Timeout), so a driver is never re-offered the same order. Choose the **nearest** among the remaining eligible drivers.
- If no eligible driver remains, leave the order `New` (it will be retried next tick as drivers move / come online; if the candidate pool is permanently empty the order simply waits — the customer keeps "Looking for drivers…" with Cancel, per UC-016). Log a Debug reason (no driver found) — never spam.

## 3. Interaction with the offer-timeout loop

- Auto-dispatch offers exactly one driver at a time (New → Assigned). The existing `OfferTimeoutJob` reverts an unaccepted `Assigned` order to `New` after `OfferTimeoutSeconds`, writing the timeout `order_event`. On the next auto-dispatch tick that order is `New` again and its exclusion set now includes the timed-out driver, so the **next-nearest** driver is offered. This produces sequential nearest-first offering with no new timeout logic.
- Ensure no double-offer race: only orders in status `New` are picked up; an order already `Assigned` is skipped. `OrderService`'s optimistic-concurrency `Version` guards concurrent transitions (a manual dispatcher assign that lands first makes the job's transition a no-op/conflict which is caught and skipped).

## 4. Wiring, config, logging

- Register `AutoDispatchJob` as a hosted service (alongside `OfferTimeoutJob`). A global enable is implicit via per-fleet `AutoDispatchEnabled`; if a global kill-switch is desired, gate registration/activation behind a config flag (document it). Poll interval short (e.g. 5s, matching `OfferTimeoutJob`).
- Logging per `rules/logging.md`: event-style, structured; `Information` on an auto-assignment (`OrderId`, `DriverId`, `FleetId`), `Debug` for "no eligible driver" skips with a `Reason`. Never log PII beyond ids.

## 5. Tests (`api/tests/Taxi.Api.Tests/...`)

Construct the job and call `RunTickAsync` directly (Testcontainers). Cover:
1. `New` order + one eligible in-radius online driver → order becomes `Assigned` to that driver; an `order_event` + `OrderChanged` broadcast recorded.
2. Nearest-first: two eligible drivers → the closer one is offered.
3. Radius: a driver outside `MaxOfferRadiusKm` is not offered; a `New` order with no in-radius driver stays `New`.
4. Exclusion: after a driver times out (simulate the `OfferTimeoutJob` revert + timeout event), the next tick offers the **next-nearest** driver, not the timed-out one; when all candidates are exhausted the order stays `New`.
5. Gating: `AutoDispatchEnabled = false` (or missing settings row) → order untouched; `AutoDispatchAfterSeconds` not yet elapsed → order untouched (advance `FakeTimeProvider`).
6. Eligibility: stale-position or offline drivers are excluded.
7. Tenant isolation: a `New` order in fleet B is not affected while dispatching fleet A; the assign runs in the correct tenant context.
8. Concurrency: a manual assign that wins first makes the job's transition a no-op (no exception surfaced), order ends `Assigned` to the manually-chosen driver.

## Acceptance criteria

1. For a fleet with `AutoDispatchEnabled = true`, a `New` order older than `AutoDispatchAfterSeconds` is automatically assigned to the nearest eligible online driver within `MaxOfferRadiusKm`, via `OrderService`/`OrderStateMachine` (New → Assigned), emitting the `order_event` + `OrderChanged` broadcast.
2. If the offered driver declines or the offer times out, the order (reverted to `New` by `OfferTimeoutJob`) is re-offered to the next-nearest driver **not already tried**, until one accepts or candidates are exhausted; an exhausted order remains `New`.
3. Drivers outside the radius, offline, on an active ride, or with a stale position are never offered; a fleet with auto-dispatch disabled (or no settings row) is never auto-dispatched.
4. Manual dispatcher assignment is unaffected and always wins a race (optimistic concurrency); the job never overrides a human action or double-assigns.
5. Tenant isolation holds (fleet A dispatch never touches fleet B); the job follows the established `RunTickAsync`/per-order-scope pattern and is deterministically testable.
6. Quality gate green: `dotnet build -warnaserror` and `dotnet test` (user-local SDK; Docker up). No frontend changes required — the existing `OrderChanged` stream drives the UI.
