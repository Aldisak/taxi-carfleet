# UC-004 — Customer PWA

- **Sequence:** 004
- **Stack:** mixed — frontend (`/web`, `/c/*` routes + PWA) + backend support (`/api`: public endpoints, rating, pricing quote)
- **Complexity tag:** novel (unauthenticated public endpoints, HMAC tracking tokens, phone-code customer login, 3-tap ordering, price-preview, live tracking, slow-3G budget)
- **Mode:** autonomous batch run (standing user directive renewed 2026-09-12: gates pre-approved, parallel lanes, use the renamed backend-developer/frontend-developer agents, interrupt only on 3-round blocks / quality-gate failures / undecidable scope)
- **Sources of truth:** `.claude/state/00-PROJECT-CONTEXT.md` (§4 stack, §6 conventions, §7 multi-tenancy, §8 state machine, §10 SignalR, §11 UX), `.claude/state/04-customer-pwa.md` (screens/behavior/ACs — authoritative, do not restate), `docs/api.md`, `docs/decisions.md`, CLAUDE.md facts.

## Title

Customer PWA: `/c/*` mobile-first app — order a taxi in 3 taps via common routes (or ~30 s with custom addresses), phone-code login, fixed/estimate price preview, live tracking via SignalR with a logged-out tracking link, cancel, history, rating, and a "Zavolat" phone fallback on every screen — plus the public/rating/pricing backend endpoints it needs.

## Actors

- **Customer** — possibly 70 years old, cheap Android, weak signal. Orders a ride, tracks the car, rates it. No password account; fleet comes from the subdomain.
- **Dispatcher / Driver** — (indirectly) fulfil the order; dispatcher order-detail gains the customer rating.
- **System** — SignalR realtime, OSRM ETA, SMS code issuance (UC-001), HMAC tracking-token validation.

## Preconditions

- UC-001 + UC-002 + UC-003 on the branch history (`14fb448`): backend 283 tests, web 627 unit tests + 5 Playwright e2e, SignalR realtime client infra, i18n discipline, theme, `/x` + `/d` route groups. Node 20.0.0 pins binding. Docker running.
- Existing backend to reuse/verify (designer must confirm against source, not assume): customer phone-code login + SmsCode (UC-001), `geo/suggest` + `geo/route` (dispatcher/driver), order create/cancel + OrderStateMachine, SignalR `Subscribe(orderId)` customer path (UC-001/003), tenant resolution by fleet slug.
- Known gaps the designer resolves: a **public (unauthenticated)** endpoint surface (`GET public/fleet`, `GET public/track/{code}?k=`) likely does not exist yet; `pricing/quote` likely does not exist (assignment says use a tariff estimate until assignment 06 provides route matching); common-routes listing endpoint may not exist (06 owns routes/zones/pricing — decide what to stub vs. build minimally now and document).

## Main flow (system level)

**Lane A — backend (api/):**
1. **Public fleet branding:** `GET /api/v1/public/fleet` (anonymous, fleet from subdomain/`X-Fleet-Slug`) → name, phone, primary color, flags. No tenant leak (only the resolved fleet's public fields).
2. **Public tracking:** `GET /api/v1/public/track/{code}?k=` (anonymous) validates the tracking token = HMAC of `orderId + expiry` (valid until 2 h after completion) and returns the reduced tracking DTO (status, ETA inputs, driver first name, vehicle plate/color, pickup/dropoff, price, code). Expired/invalid token → 401/410-style "link expired" contract (designer picks the status + error code per rules/error-handling.md). Mint the token when the order/SMS tracking link is created.
3. **Rating:** `POST /api/v1/orders/{id}/rating` (customer-only, once per order) stores `RatingStars` (1–5), `RatingComment?`, `RatedAt` on Order + migration; validator enforces range/once. Dispatcher order-detail response gains the rating (small UC-002 change).
4. **Pricing quote:** `GET/POST /api/v1/pricing/quote` returns a fixed price or an estimate RANGE (never a single exact estimate) from the tariff until assignment 06 lands route matching; shape must let the client render "Cena 300 Kč – pevná" or "Odhad 180–220 Kč".
5. **Customer order create/cancel:** reuse existing order create; ensure a customer can create from route/custom and cancel in New/Assigned/Accepted with reason `customer` (drives UC-003 driver-returns-home, AC #5). Add/confirm a customer-facing active-order lookup and common-routes-valid-now listing (minimal, or documented stub pending 06).

**Lane B — frontend (web/, `/c/*`):**
6. **PWA + shell:** `/c/*` route group lazy-loaded; fleet branding from `GET public/fleet`; "Zavolat" (`tel:`) on every screen; offline home shows cached routes + phone, ordering disabled with "Jste offline – zavolejte nám"; first load < 3 s on slow 3G (Leaflet lazy, home never waits for the map).
7. **Home (`/c`):** common-routes cards (name, price, one tap → Confirm preselected; only valid-now; hidden if none); "Vlastní adresa" → custom; sticky active-order banner replacing routes when an order is active.
8. **Confirm route order (`/c/order/route/:routeId`):** PointToPoint (locked pickup/dropoff + optional note), Zone (pickup restricted to zone, server-validated, out-of-zone → estimate with consent), ZoneToZone (from/to validated); When Hned/Na čas (+20 min…+7 days); passengers 1–4; big fixed price; Objednat → inline login if needed (don't lose form state) → create → Tracking.
9. **Custom order (`/c/order/new`):** pickup autocomplete (`geo/suggest`) + "Použít moji polohu" (reverse geocode) + map-pin drag fallback; dropoff optional; price preview from `pricing/quote` (range for estimates); When/passengers/note; Objednat as above.
10. **Login step (`/c/login` inline):** +420 phone, send code, 6-digit auto-submit, resend after 60 s, plain-Czech errors; store tokens; never re-ask on device unless refresh fails.
11. **Tracking (`/c/t/:code`):** large human status headline per state (Hledáme řidiče… / Řidič Petr přijede za ~6 min with 15 s ETA refresh / Řidič je na místě + plate+color / Jedete / Hotovo – price + rating / Cancelled reason + Zavolat); map car via SignalR `Subscribe(orderId)` with `GET public/track` poll fallback every 10 s; collapsed details; "Zrušit objednávku" (New/Assigned/Accepted, confirm dialog, post-Accepted hint); push-subscription prompt after first order.
12. **Rating:** 1–5 stars + optional comment → `POST orders/{id}/rating`, once.
13. **History (`/c/history`):** past orders (date, addresses/route, price, status); tap → read-only Tracking; "Objednat znovu" copies addresses into Custom order.
14. **E2E (mobile viewport):** AC #1 (3-tap common-route order → phone+code → Tracking "Hledáme řidiče…"), AC #2 (dispatcher assign + driver accept via API → headline updates + car marker moves, no reload), AC #3 (logged-out tracking link valid vs. expired token), AC #5 (cancel in Accepted → Cancelled reason `customer`, driver returns Home).

## Acceptance criteria

The 7 in `.claude/state/04-customer-pwa.md` are binding. Likely scope amendments to record in `docs/decisions.md` (designer confirms): push-notification SENDING deferred to assignment 05 (client subscription prompt + permission in scope; server push out); `pricing/quote` uses the tariff estimate until assignment 06 provides route matching; common-routes/zone validation depth bounded to what exists pre-06 (minimal listing now, full management in 06). AC #6 Lighthouse (Perf ≥ 85, PWA installable, A11y ≥ 90) is a manual/measured step documented in DEMO.md (SW/manifest only activate on a production build).

## Out of scope

Card payment, password accounts, multi-fleet switching (fleet from subdomain), full route/zone/pricing MANAGEMENT (assignment 06), server-side push SENDING (assignment 05), native wrapper, changes to `/x` or `/d` beyond the small dispatcher rating-display addition.

## Non-functional requirements

- Mobile-first portrait, also fine on desktop; touch targets ≥ 48 px; formal Czech "vy"; no dark patterns (cancel easy, price always visible before ordering).
- First load < 3 s slow-3G; map tiles lazy; works without notification/location permission (enhancements only); offline degrades to cached routes + Zavolat.
- All strings `cs.json` + `en.json` parity; money integer CZK formatted at render; timestamps Europe/Prague.
- Quality gate (blocking): api `build -warnaserror` + `test`; web `tsc` + `eslint --max-warnings 0` + `vitest` + `build` + `size` + `playwright` (new customer specs). Informational: format checks.
- Conventions: reuse UC-002/003 frontend infra (api client, realtime, i18n, theme — extend, don't fork), `/c` features under `web/src/features/customer*`; backend per `.claude/rules`; multi-tenancy + tenant-isolation test per feature; public endpoints must not leak cross-fleet data.

## Notes for the designer

- Break into Lane A (api) + Lane B (web) WIs with `lane` + `depends_on`; topologically ordered. Public endpoints (fleet, track) and the tracking-token HMAC are the novel backend risk — investigate the existing auth/tenant middleware and SmsCode/customer-login surface against source before designing; do NOT assume endpoints exist.
- Decide and document the pre-06 stubs (common-routes listing, pricing/quote, zone validation) so Lane B has stable contracts.
- Carry forward the UC-003 review lessons: envelope shapes in `client.ts` (unwrap `{ order }`-style response DTOs — see the getOrder/patchOrder facts), single `/hubs/fleet` connection + `Subscribe` customer path, cache-patch-not-refetch, exactly-once where mutations can retry.
