# Assignment 014 — Customer map-first shell & shared primitives (Uber/Bolt redesign, part 1/3)

Read `00-PROJECT-CONTEXT.md` first. Requires 002/003/004 (the three clients) and 010 (Mapy geo) merged. This is the **foundation** of a 3-part customer PWA redesign (UC-014 → UC-015 → UC-016) that recreates the customer experience as a modern, mobile/tablet-first, **map-first** app like Uber/Bolt. This assignment is mostly frontend (`/web`) with **one small backend slice** (`/api`) to unblock the logged-out experience.

## Why

The customer PWA today is form-first: `CustomOrderPage`/`RouteOrderPage` with collapsible mini-maps and a separate `TrackingPage`. The target experience is: the **whole background is a draggable/zoomable map**, a "Kam to bude?" (where to?) search sits on top, and a **bottom sheet** carries the price → order → live-ride states. `MapyMap` (`web/src/shared/map/MapyMap.tsx`) already supports pinch-zoom and drag (Leaflet defaults) but is only ever rendered at a fixed height inside collapsible sections. There is no full-screen map surface, no bottom-sheet primitive, and no reverse-geocode client. This assignment builds those reusable foundations so UC-015 (order flow) and UC-016 (live tracking) can compose them.

A true Bolt-style flow lets a logged-out visitor **search a destination and see the price before logging in**. `POST /pricing/quote` is already `AllowAnonymous`, but `geo/suggest|geocode|reverse` are `CustomerOrStaff`, so a logged-out user gets no suggestions and no pin-address. This assignment relaxes those three geo proxy endpoints to **anonymous-by-slug** (mirroring the quote endpoint), which is the single backend change the whole redesign needs.

## Goal

A reusable **full-bleed map shell** for the customer app (map fills the viewport as the background, UI overlaid with safe-area awareness), plus the shared primitives the next two UCs depend on: a `BottomSheet`, a "searching" loader, a customer map **camera controller**, and a **center-pin + reverse-geocode** pickup mechanism defaulting to the user's GPS location. Logged-out customers can search and reverse-geocode because the geo proxy endpoints now work anonymously per fleet slug.

## Scope

**In:** a full-viewport customer map shell (new) that keeps branding/language/call/slug/silent-refresh from the current `CustomerLayout`; a `BottomSheet` primitive; a "searching"/loading indicator; a customer-map camera controller (imperative `setView`/`fitBounds`); a reverse-geocode client method + hook + center-pin pickup logic defaulting to GPS; the backend change to make `geo/suggest|geocode|reverse` anonymous-by-slug + rate-limit by a non-JWT key when unauthenticated; dropping the `hasToken` gate in `useSuggest`; i18n for new strings in all six locales; a11y + responsive.

**Out:** the actual order flow (search overlay wiring, price sheet, create order) — that is UC-015; the live-ride tracking states — UC-016; removing the old order/tracking pages (UC-015/016 do that as they replace each screen); any change to money/date formatting; SSR.

## 1. Full-bleed map shell (`web/src/features/customer/shell/`)

Create a map-first shell (e.g. `CustomerMapShell.tsx`) — or refactor `CustomerLayout.tsx` — where the map is a background layer filling the viewport (`height: 100dvh`, `position: fixed/absolute`) and UI is overlaid:
- Keep, unchanged in behavior: the branded `ThemeProvider` (`useFleetBranding`), `ensureFleetSlug()` in a `useState` initializer, silent-refresh enablement, `LanguageSelector`, `CallButton`.
- Overlay containers positioned with `env(safe-area-inset-*)` padding: a **top slot** (search — filled by UC-015) and a **bottom slot** (bottom sheet — filled by UC-015/016). Establish a z-index scale (map < overlays < Mapy attribution/logo which must stay reachable < modals).
- The map renders via a **lazy chunk** (leaflet must stay out of the eager customer bundle — CLAUDE.md WI-15 / web-performance.md#code-splitting). `MapyMap` is imported only inside that lazy component.
- Mount the map full-screen; verify pinch-zoom + drag + tap work as the primary surface (they already do — do not disable Leaflet gesture defaults).

## 2. Shared primitives

- **`BottomSheet`** (`web/src/shared/ui/BottomSheet.tsx` or `features/customer/shell/`): fixed to the bottom, rounded top corners, theme tokens only, scrollable content, at least a collapsed/expanded height behavior; accessible (`role="dialog"` or `region` with an `aria-label`, focus management, Escape to collapse/close, ≥48px targets, focus-visible). Ships a vitest-axe test. Reuse existing button styles (`RideButton`/`CustomOrderPage` `SubmitButton` precedents) rather than inventing new button components.
- **Searching/loading indicator**: an animated, theme-tokened loader with `role="status"` + an i18n label (used by UC-016 "Looking for drivers…" and generally). Mirror the `MapyMap` `LoadingState` precedent.
- **Camera controller** (customer map): a headless component using `useMap()` to imperatively `setView`/`fitBounds` toward a supplied target (single point or a bounds of pickup+destination/driver), mirroring board `MapPanel.tsx`'s `MapCenterController` (read positions imperatively; avoid reactive re-render storms). Consumed by UC-015/016.

## 3. Center-pin pickup + reverse-geocode

- **Client**: add `getGeoReverse(lat, lng)` to `web/src/shared/api/client.ts` calling `GET /geo/reverse` (returns `{ found, label, street, municipality }`), following the existing `getGeoSuggest` pattern.
- **Hook**: `useReverseGeocode` (debounced) resolving coordinates → address label, TanStack-cached.
- **Center-pin logic** (pure, tested `.ts`): a fixed pin at map center; on map `moveend` (debounced) take the center coords and reverse-geocode them to a label. Default the initial map center to the user's **GPS** location (with permission handling — denied/unavailable falls back to the fleet config center from `useGeoConfig`). Keep the pure decision logic (permission state → center source; move → debounce → coords) in a colocated tested module; the Leaflet wiring lives in the lazy map component.

## 4. Backend slice — anonymous-by-slug geo proxy (`/api`)

- Change `geo/suggest`, `geo/geocode`, `geo/reverse` from `Policies(CustomerOrStaff)` to `AllowAnonymous()` with a `Summary` note, relying on `TenantResolutionMiddleware` resolving `X-Fleet-Slug` → a real `FleetId` for anonymous requests (it already does; `GeoService`/`MapyKeyResolver` then resolve the fleet's Mapy key — the recent MapyClient key-passing fix). Requests with no resolvable fleet return an empty/`found:false` result (never 500).
- **Rate limiting**: `GeoRateLimiter` currently keys on the JWT `sub` claim. When unauthenticated, key by a stable non-JWT identifier (client IP, or the fleet slug) so anonymous suggest/reverse are still throttled; keep the 5 req/s per-user bucket when authed. Never leave anonymous calls unlimited.
- **Frontend**: drop the `hasToken` gate in `web/src/features/customer/order/useSuggest.ts` so suggestions work logged-out (still gated on ≥3 chars + debounce).
- **Tests**: integration tests that anonymous `geo/suggest|geocode|reverse` with `X-Fleet-Slug` return results (using the `FakeGeoService`/fake client), that a missing fleet slug degrades cleanly, and that the anonymous rate-limit key path works. Update any existing suggest/geocode/reverse access tests that asserted 401/403 for anonymous.

## 5. i18n, a11y, responsive

New strings (search placeholder is UC-015; here: loader label, map/GPS permission messages, sheet aria-labels) added to **all six** locale files (`cs-CZ` authoritative; parity test gates it). Every new interactive component ships a vitest-axe test; ≥48px targets; visible focus; the sheet traps/ō restores focus and closes on Escape. Layout verified at phone and tablet widths with safe-area insets. Money/date formatting stays `cs-CZ`/`Europe/Prague`.

## Acceptance criteria

1. The customer app renders a **full-screen map** that fills the viewport and supports pinch-zoom, drag, and tap on mobile/tablet; UI overlays respect safe-area insets and the Mapy attribution/logo stays visible and reachable.
2. A logged-out visitor (with a fleet resolved by slug) gets **address suggestions** and a **reverse-geocoded pin address** — `geo/suggest|geocode|reverse` succeed anonymously and are rate-limited by a non-JWT key; a request with no resolvable fleet degrades to empty, never 500; authed behavior (5 req/s per user) is unchanged.
3. The **center pin** defaults to the user's GPS location when permission is granted, else the fleet's configured center, and re-resolves the pickup address when the map is moved (debounced).
4. `BottomSheet` and the searching loader are reusable, theme-tokened, accessible (axe-clean, keyboard/focus/Escape, ≥48px), and the camera controller can `setView`/`fitBounds` imperatively.
5. Leaflet remains out of the eager customer bundle (verified in `dist`); `npm run size` passes.
6. New i18n keys exist in all six locales (parity green); quality gates green — web `tsc`, `lint` (0 warnings), `vitest`, `build`, `size`; backend `dotnet build -warnaserror` + `dotnet test`.
