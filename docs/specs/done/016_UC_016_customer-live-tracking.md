# Assignment 016 — Live ride tracking on the map (Uber/Bolt redesign, part 3/3)

Read `00-PROJECT-CONTEXT.md` first. **Depends on UC-015** (map-first order flow) and **UC-014** (shell, `BottomSheet`, camera controller). Frontend-only (`/web`). This assignment builds the post-order experience and **replaces** the old `TrackingPage`.

## Why

After the customer taps **Order** (UC-015), the app must show a live, map-first ride experience like Bolt: the bottom card becomes **"Looking for drivers…"** while the system searches, then — when a driver accepts — shows the driver + vehicle + ETA and the **driver's live position moving toward the pickup** on the map, followed by arrival, the ride, completion, and rating. The backend already streams everything: an authenticated customer calls SignalR `Subscribe(orderId)` and receives `OrderChanged` (status), `DriverPositionChanged` (live position ≤3s), and `PickupEtaUpdated` (ETA). A logged-out SMS-link recipient polls `GET /public/track/{code}?k=token`. The current `TrackingPage` renders this as a text headline + a collapsible mini-map; this assignment turns it into the full-screen, state-driven map experience.

## Goal

A single map-first tracking screen whose **bottom sheet is driven by order status** and whose **map shows the driver approaching in real time**. It replaces `TrackingPage`, reuses the existing tracking hooks/logic, works in both authed (SignalR) and public (token-poll) modes, and adds smooth driver-marker movement.

## Scope

**In:** the map-first tracking screen replacing `TrackingPage`; a status-driven bottom sheet (searching → driver assigned/ETA → arrived → in-progress → completed/cancelled) reusing `headlineRules`; live driver marker on the full-screen map with camera follow (UC-014 controller) and **smooth interpolation** between position updates; cancel (allowed states) and rating (on completion) reusing existing hooks; public/token-poll mode rendering the same UI; push-prompt; i18n (6 locales) + a11y; updated tracking e2e.

**Out:** the order-placement flow (UC-015); shell/sheet/camera primitives (UC-014); any backend change (all realtime/tracking endpoints exist); ETA for the public poll mode beyond what the endpoint returns (it returns null today — display gracefully); auto-dispatch (a v1.1 backend concern — "Looking for drivers…" reflects real New/Assigned states and offers Cancel; it does not fabricate assignment).

## 1. Map-first tracking screen (`web/src/features/customer/tracking/`)

- Replace `TrackingPage.tsx` with a screen mounted in the UC-014 shell: full-screen map with the driver marker + pickup pin, and a status-driven `BottomSheet`. Route stays `/customer/t/:code` (supports authed and `?k=token` public modes).
- **Mode resolution** unchanged: reuse `trackingMode.ts`, `useTrackingAuthed` (SignalR `useFleetHub(true)` + `Subscribe(orderId)`), `useTrackingPublic` (10s poll, stops on 410). Authed live position comes from `usePositionStore` (`DriverPositionChanged`); public mode uses the DTO's last-known position.

## 2. Status-driven bottom sheet

Drive the sheet content from the order status (reuse/extend `headlineRules.ts`):
- **New / Assigned** → **"Looking for drivers…"** using the UC-014 animated loader (`role="status"`), plus a **Cancel** action (allowed in New/Assigned/Accepted per the state machine; reuse `useCancelOrder` + `CancelDialog`).
- **Accepted** → driver first name, vehicle (plate/color), and **ETA** from `PickupEtaUpdated` ("Driver arrives in ~X min"); Cancel still offered.
- **Arrived** → "Driver is here" prompt.
- **InProgress** → "On the way to your destination" (optionally show the destination on the map).
- **Completed** → ride summary (final/fixed price, addresses) + **rating** (reuse `RatingForm`/`StarPicker`/`useRateOrder`, authed only).
- **Cancelled** → a clear cancelled state with a way back to `/customer` (re-order).

## 3. Live driver marker + camera

- Render the driver marker on the full-screen map from the live position (authed: `usePositionStore` via `selectCarMarker`; public: DTO position). Keep the pickup pin; when en route, use the UC-014 camera controller to **follow the driver / frame driver+pickup** (`fitBounds`), and when arrived/in-progress frame appropriately.
- **Smooth interpolation** (new): animate the marker between discrete position updates (~3s apart) instead of jumping, in a pure, tested module (given previous + next coord + elapsed → interpolated coord; respect `prefers-reduced-motion`). Keep it lightweight — no new heavy dependency; do not pull leaflet into the eager chunk.
- Reuse `markerThrottle`/position patterns from the board where useful; the customer screen typically tracks one driver.

## 4. Reuse & remove

Reuse: `useTrackingAuthed`, `useTrackingPublic`, `trackingMode`, `selectCarMarker`, `trackingMarker`, `headlineRules`, `useCancelOrder`, `useRateOrder`, `RatingForm`, `PushPrompt`, `usePositionStore`, `useFleetHub`. Replace the old `TrackingPage` + `StatusHeadline` + `TrackingMap`/`TrackingMapInner` presentation with the map-first equivalents (the map now uses the UC-014 full-bleed map, not a collapsible mini-map). Update `router.tsx` if the tracking element changes. Remove superseded presentational components + their tests; keep the reused logic/hooks and their tests.

## 5. Tests, i18n, a11y

- Pure logic first: status→sheet mapping (extend `headlineRules.test.ts`), marker interpolation (fake timers), `selectCarMarker`.
- Component: sheet per status (searching/assigned/arrived/in-progress/completed/cancelled), cancel flow, rating flow, live-marker update (mock hub/store), public-poll mode rendering the same UI (mock client). Mock `@/shared/api/client` and invoke hub/reducer functions directly — never a live hub in unit tests.
- **e2e**: a driver-approach flow if the harness supports it (create order → driver accepts via API helper → customer sees driver assigned + marker); otherwise assert the searching→assigned sheet transition with a mocked event. Keep e2e `cs-CZ`.
- New strings ("Looking for drivers…", ETA, arrived/in-progress/completed/cancelled headlines, cancel/rating labels) in all six locales — parity green. Axe on every new interactive component; ≥48px; focus/Escape on sheet + `CancelDialog`; `role="status"`/`role="alert"` where appropriate. Money `cs-CZ`/`Kč`, dates `Europe/Prague`. Respect `prefers-reduced-motion` for marker animation.

## Acceptance criteria

1. Immediately after ordering, the tracking screen shows the full-screen map with a **"Looking for drivers…"** bottom sheet (animated) while the order is New/Assigned, with a working **Cancel**.
2. When a driver accepts, the sheet updates live (via `OrderChanged`) to show the driver, vehicle, and **ETA** (`PickupEtaUpdated`), and the **driver marker moves on the map toward the pickup** in real time (`DriverPositionChanged`), with the camera following/framing driver + pickup.
3. The driver marker animates **smoothly** between position updates (no jumps), and honors `prefers-reduced-motion`.
4. Arrival, in-progress, completion (with **rating**), and cancellation each render a clear, correct sheet state; cancel is offered only in states the state machine allows.
5. Both **authed** (SignalR) and **public SMS-link** (token-poll, stops on 410/expired) modes render the same map-first UI; public mode degrades gracefully where live data (e.g. ETA) is unavailable.
6. The old `TrackingPage` presentation is replaced with no dangling references; reused hooks/logic keep working.
7. Quality gates green: web `tsc`, `lint` (0 warnings), `vitest`, `build`, `size`, and the updated `e2e`; i18n parity across six locales; leaflet stays in lazy chunks.
