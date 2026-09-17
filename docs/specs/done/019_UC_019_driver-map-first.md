# Assignment 019 — Driver PWA map-first redesign (offer box + on-accept navigation)

Read `00-PROJECT-CONTEXT.md` first. Requires 003 (driver PWA) merged and **depends on UC-014** (the shared map-first shell, `BottomSheet`, and camera controller from the customer redesign). Frontend-only (`/web`). Composes with UC-017 (auto-dispatch generates the offers) but works identically with dispatcher-assigned offers.

## Why

The customer app is being redesigned map-first (UC-014/015/016). The driver app should match: a driver spends the shift looking at a map, needs to see where they are, and must react to incoming order offers fast. Today the driver UI is form/list-first — `DriverHomePage` (status + vehicle) and a separate `DriverRidePage` with a **collapsible** mini-map (`RideMapStrip`/`RideMapInner`) that draws only markers, and offers arrive as a **full-screen text takeover** (`OfferTakeover`). The backend already provides everything for a modern experience: offers via SignalR `NewOrderOffered(dto, expiresAt)`, all order transitions (`DriverOnly`), live position (`UpdatePosition`/`DriverPositionChanged`), and `POST /geo/route` (callable by drivers) returning a **fastest-route polyline + ETA** (`car_fast`) — but the route geometry is fetched for ETA and **never drawn on the map**. This assignment turns the driver app into a map-first experience with a top **Accept/Decline** offer box and an on-accept **navigation route** drawn on the map.

## Goal

A single map-first driver screen: the map fills the viewport showing the driver's live position; an incoming offer appears as a **top box** with **Accept / Decline** (price, pickup/dropoff, distance+ETA, countdown); on **Accept** the fastest route (driver→pickup, then pickup→destination after arrival) is drawn on the map as live navigation with ETA, with a prominent **Navigate** button handing off to the driver's external nav app (Google/Waze/Mapy) for voice turn-by-turn. Ride controls (Arrive → Start → Complete, No-show) live in a bottom sheet. All existing driver hooks (offer/ride/position/online) are reused; only the presentation changes.

## Scope

**In:** one map-first driver screen replacing `DriverHomePage` + `DriverRidePage`; the driver's live position + camera follow; a **top offer card** (Accept/Decline, redesigned from `OfferTakeover`); on-accept **route polyline** rendering (driver→pickup / pickup→destination) from `POST /geo/route` geometry, drawn on the full-screen map with ETA and an external-app **Navigate** handoff; ride controls in a bottom sheet; removal of the superseded presentational components; i18n (6 locales) + a11y; updated driver e2e.

**Out:** any backend change (all endpoints/events exist; the route already uses the fastest `car_fast` profile); in-app **turn-by-turn voice/maneuver** guidance (Mapy returns geometry only — voice is delegated to the external nav app via `buildNavUrl`); changes to Settings/History/Complete/Login screens (kept; Complete is still reached from the ride sheet); the offer/accept/decline/transition **backend contracts** and the position-reporting/queue logic (reused unchanged).

## 1. Map-first driver screen (`web/src/features/driver/**` + `web/src/app/`)

- Replace `DriverHomePage` and `DriverRidePage` with a single map-first screen mounted in the driver shell, using the **UC-014 shared full-bleed map shell** (`MapyMap` at `100dvh`, safe-area-aware overlays, leaflet in a lazy chunk). Keep the driver `BottomNav` (Home/History/Settings) and the session-wide mounts from `DriverLayout` (`useFleetHub`, `useOfferListener`, `DriverPositionReporter`, `DriverQueueBar`).
- The map shows the **driver's own live position** (`useOwnPositionStore`) with the camera following it (UC-014 camera controller). Overlay content is **state-driven** by `useDriverMe` status + offer/active-order state:
  - **Offline** → a bottom panel: vehicle selector + "Začít směnu" (`useGoOnline`); geolocation permission prompt as today.
  - **Free** (online, waiting) → minimal "Čekám na objednávku" indicator + "Ukončit směnu" (`useGoOffline`).
  - **Busy/EnRoute** (active ride) → the ride view (§3).

## 2. Top offer box (redesign `OfferTakeover` → a top card)

- When `useOfferStore` has an offer (from `NewOrderOffered`), render a **top box** overlaid on the map (not a full-screen takeover): pickup address (prominent), dropoff, price (`PriceBadge`), distance + ETA to pickup (`useOfferRoute`), and a **server-timed countdown** (`CountdownRing` from `expiresAt`; on expiry auto-dismiss + toast, as today). Optionally draw the driver→pickup route line on the map while the offer is shown.
- **Accept** (reuse `useOfferAccept` → bodyless `POST /orders/{id}/accept`) and **Decline** with the reason step (reuse `useOfferDecline` + `DeclineReasons`). Preserve the existing double-tap guards, stale (404/409) → toast, and offline handling. On accept, transition into the active-ride view.
- Keep the sound/vibration behavior (offer arrival) and the `driver:newOrderOffered` event plumbing unchanged.

## 3. Active ride + on-accept navigation

- On accept, show the **active ride** on the map: markers for own position, pickup, and dropoff, **plus the fastest route polyline** — build a driver map component (extend `RideMapInner` or a new `DriverMapInner`) that renders a react-leaflet `<Polyline>` from the `Geometry` returned by `POST /geo/route`, kept in a **lazy leaflet chunk** (never eager). A pure, tested module decides **which leg** to fetch/draw per status: Accepted → driver→pickup; InProgress → pickup→destination (skip if no dropoff). Refetch the leg on significant driver movement is optional; at minimum fetch on status change. Camera frames/follows the active leg (UC-014 controller).
- Show live **ETA** (from `useOfferRoute`/`PickupEtaUpdated` / the route response) in the ride sheet.
- **Ride controls in a `BottomSheet`** driven by `rideButtonState`/`AllowedActions` (reuse `RideButton` + `useRideTransition` for Arrive/Start/Complete/No-show with the offline queue + reconcile intact). A prominent **Navigate** button hands off to the external nav app (reuse `buildNavUrl`/`NavHandoff` + the settings nav-app preference) toward the current target (pickup or destination) for real voice turn-by-turn.
- Keep active-ride **restore** (`useRideRestore`/`reconcileActiveRide`) and **mid-ride reassignment** (`useLiveClear`, F-04). Complete → the existing `/driver/ride/complete` flow (`CompletePage`/`useCompleteRide`), reached from the ride sheet.

## 4. Reuse & remove

Reuse unchanged: `useOfferStore`/`useOfferListener`/`useOfferAccept`/`useOfferDecline`/`useOfferRoute`, `CountdownRing`, `DeclineReasons`, `useRideTransition`, `useRideRestore`, `useLiveClear`, `useActiveOrderStore`, `rideButtonState`, `RideButton`, `usePositionReporting`/`useOwnPositionStore`/`DriverPositionReporter`, `useGoOnline`/`useGoOffline`/`useOwnStatusSync`/`useDriverMe`, `buildNavUrl`/`navLinks`, `DriverQueueBar`/transition queue, `MapyMap`, `useFleetHub`. Remove superseded presentation: `DriverHomePage`, `DriverRidePage`, `OfferTakeover` (full-screen), `RideMapStrip` (collapsible), and their colocated tests — replaced by the map-first equivalents. Update `router.tsx`/`DriverLayout` so `/driver` renders the map-first screen. Keep `/driver/history`, `/driver/settings`, `/driver/ride/complete`, `/driver/login`.

## 5. Tests, i18n, a11y

- Pure logic first: route-leg selection (status → which leg), offer-card view state, marker/camera selection.
- Component: offer top box (accept/decline/countdown/expiry, mock hub + client), ride sheet transitions (arrive/start/complete/no-show, mock `useRideTransition`), route polyline render (mock `./DriverMapInner` in jsdom — never mount a real `MapContainer`), online/offline panel.
- Update the driver **e2e**: offer → accept → route shown → arrive → start → complete (reuse the `apiDriver` helper; remember accept/arrive/start are bodyless — no Content-Type). Keep e2e `cs-CZ`.
- New strings (offer box, "Navigate", ETA labels, waiting/shift states) in **all six** locales — parity green; **driver-facing informal tone ("ty")** for ru/uk/de. Axe on every new interactive component; ≥48px targets; focus/Escape on the sheet; `role="status"`/`role="alert"` where appropriate. Leaflet stays lazy (verify in `dist`); `size` within budget. Money `cs-CZ`/`Kč`, dates `Europe/Prague`.

## Acceptance criteria

1. A logged-in driver sees a **full-screen map** with their own live position; going online/offline and the vehicle selector work from the map-first overlay.
2. An incoming offer appears as a **top box** with **Accept / Decline**, showing pickup/dropoff, price, distance+ETA, and a live countdown that auto-dismisses on expiry; accept and decline (with reason) call the correct endpoints with the existing stale/offline/double-tap handling.
3. On **Accept**, the map draws the **fastest route** to the pickup with ETA, and a **Navigate** button opens the driver's chosen external app; after **Arrive**, the route re-draws to the destination.
4. Ride controls (Arrive → Start → Complete, No-show) work from the bottom sheet via the existing transition machinery (offline queue + reconcile + mid-ride reassignment intact); Complete leads to the existing completion flow.
5. The old `DriverHomePage`/`DriverRidePage`/`OfferTakeover`/`RideMapStrip` presentation is removed with no dangling references; Settings/History/Complete/Login still work; all reused hooks keep functioning.
6. Leaflet stays out of the eager driver bundle (verified in `dist`); quality gates green — web `tsc`, `lint` (0 warnings), `vitest`, `build`, `size`, and the updated `e2e`; i18n parity across six locales.
