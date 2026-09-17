# Assignment 015 — Destination → price → place order (Uber/Bolt redesign, part 2/3)

Read `00-PROJECT-CONTEXT.md` first. **Depends on UC-014** (the map-first shell, `BottomSheet`, camera controller, reverse-geocode/center-pin, anonymous geo). Frontend-only (`/web`). This assignment builds the ordering half of the map-first customer experience and **replaces** the old order screens.

## Why

With the full-screen map shell in place (UC-014), the customer's home is the map itself. The ordering experience must feel like Bolt: the map fills the screen, a "Kam to bude?" (where to?) search sits on top, and once a destination is chosen the price appears in a bottom card with **Order** and **Cancel**. The current `CustomOrderPage` (form + collapsible map), `RouteOrderPage` (fixed-route form), and `CustomerHomePage` (route list / active-order banner) are the old form-first flow and are removed here. Fixed-price routes/zones are handled automatically: `POST /pricing/quote` already returns a **Fixed** price when a route/zone rule matches (even on pickup alone) and an **Estimate** range otherwise — so one unified destination-first flow covers both, with no separate route screen.

## Goal

A destination-first ordering flow on the full-screen map: search a destination (suggestions), confirm pickup (center-pin, defaults to GPS), see the price in the bottom sheet (fixed or estimate range), and place the order with **Order** — logging in inline (phone + SMS code) at that moment if needed, without losing the in-progress order. On success the app transitions into the live-ride view (UC-016).

## Scope

**In:** the map-first home/order screen (top search overlay with suggestions, center-pin pickup adjust, destination selection, map framing pickup+destination); the price bottom sheet (fixed/estimate/meter states) with Order/Cancel; secondary options (passengers, when/scheduled, note) in an expandable area of the sheet; inline login at Order; create-order call + navigation to the tracking route; removal of the old order/home pages and their tests; updated create-order e2e; i18n (6 locales) + a11y.

**Out:** the live-ride states after the order is placed ("Looking for drivers…", driver tracking, rating) — UC-016; the shell/sheet/camera/reverse-geocode primitives — built in UC-014; any backend change (all endpoints already exist); the `history` and standalone `login` routes (kept as-is).

## 1. Map-first home & search (`web/src/features/customer/order/` or a new `home/`)

- Replace `CustomerHomePage`, `CustomOrderPage`, `RouteOrderPage` with a single map-first screen mounted in the UC-014 shell. The map is the background; the **top overlay** is a "Kam to bude?" search field.
- Tapping the search expands a suggestions overlay backed by `useSuggest` (now anonymous — UC-014). Selecting a suggestion sets the **destination** (label + coords; geocode if needed via `getGeoGeocode`). Reuse `AddressAutocomplete`'s suggest logic where sensible, but the presentation is the new overlay (the old collapsible form is gone).
- **Pickup** defaults to the center-pin/GPS from UC-014; a compact "from" affordance lets the user adjust pickup by moving the map (center-pin re-resolves the address).
- Once pickup + destination are set, the map frames both (camera `fitBounds` from UC-014); optionally draw a simple pickup→destination indication (keep light; the route polyline is optional and must not pull leaflet into the eager chunk).

## 2. Price bottom sheet (reuse pricing logic)

- On pickup(+destination) set, call `usePriceQuote` (`POST /pricing/quote`, anonymous-by-slug) and render the result in the `BottomSheet`:
  - **Fixed** (route/zone match) → the exact price.
  - **Estimate** → a **range** (`minCzk–maxCzk`), never a single exact estimate (reuse `PriceRangeBadge`, `priceQuote.ts`).
  - **Meter/unavailable** → the existing fallback message ("Cenu nelze spočítat, zavolejte nám").
- The sheet has the primary **Order** action and a **Cancel/clear** action (resets destination, returns to the search state).
- Secondary options — **passengers** (`PassengerStepper`), **when/scheduled** (`WhenPicker`, `whenRules.ts`), **note** — live in an expandable section of the sheet (collapsed by default; Bolt-style "ride options"). Reuse the existing components and `orderForm.ts` request builders/validation.

## 3. Place order + inline login

- **Order** button: if logged out, render the inline login (`useCustomerLogin` + `CustomerLoginStep`) **inside the sheet** with all order state preserved (destination, pickup, passengers, when, note) — mirror the current `onAuthenticated` continuation pattern exactly. On auth success, resume the create call automatically.
- Create via `useCreateOrder` (`POST /orders`) with the quote-once fields (`distanceM`/`durationS` from the quote, `priceType`, coords, addresses, passengers, scheduledAt, note). On success, navigate to the tracking route with the returned `publicCode` (UC-016 renders the live-ride view). Do not queue offline (a stale order is worse than a failed one — spec §11).
- Connection-gated per `web-realtime.md#offline-ux`: block Order while disconnected with a visible reason.

## 4. Remove old screens

Delete `CustomerHomePage`, `CustomOrderPage`, `RouteOrderPage`, `AddressAutocomplete` (if fully superseded), `PickupMap`/`PickupMapInner` (superseded by UC-014 center-pin), `RouteCard`, `ActiveOrderBanner`, `useCommonRoutes`, `useRouteOrder`, `homeContent`, and their colocated tests — as they are replaced. Update `web/src/app/router.tsx` so `/customer` renders the new map-first screen. Keep `/customer/history`, `/customer/login`, and (updated in UC-016) the tracking route. Verify no dangling imports.

## 5. Tests, i18n, a11y

- Pure logic first: search/selection state, quote-view mapping (reuse `priceQuote.test.ts` patterns), request building (`orderForm`), when-rules.
- Component: search overlay (suggest results, keyboard nav), price sheet states (fixed/estimate/meter/error), Order → inline login → create (mock `@/shared/api/client`), Cancel/clear.
- **e2e**: update the create-order Playwright flow to the new map-first path (search → price → order); keep it in `cs-CZ`.
- New strings in all six locales (search placeholder "Kam to bude?", options labels, order/cancel, errors) — parity green. Axe on every new interactive component; ≥48px; focus/Escape on the sheet. Money `cs-CZ`/`Kč`, dates `Europe/Prague`.

## Acceptance criteria

1. Opening `/customer` shows the full-screen map with a "Kam to bude?" search on top; typing ≥3 chars shows address suggestions (works logged-out); selecting one sets the destination and the map frames pickup + destination.
2. Pickup defaults to the GPS/center-pin location and can be adjusted by moving the map; the resolved pickup address updates accordingly.
3. Once a destination is set, the **price** appears in the bottom sheet — a fixed price when a route/zone matches, otherwise an estimate range — with **Order** and **Cancel**; passengers/when/note are available in an expandable options area.
4. **Order** places the order; a logged-out customer completes phone+code login inline without losing the order, and the order is then created (`POST /orders`).
5. On success the app transitions to the live-ride/tracking view for the new order (`publicCode`).
6. The old `CustomerHomePage`/`CustomOrderPage`/`RouteOrderPage` (and superseded components) are removed with no dangling references; `/customer/history` and `/customer/login` still work.
7. Quality gates green: web `tsc`, `lint` (0 warnings), `vitest`, `build`, `size`, and the updated `e2e`; i18n parity across six locales.
