# Assignment 04 — Customer PWA

Read `00-PROJECT-CONTEXT.md` first. Requires 01–03 merged.

## Goal

A customer opens a link or the installed app and has a taxi ordered in **3 taps** via Common routes,
or in about 30 seconds with custom addresses. Then they see the car coming. That's it.

Assume the customer may be 70 years old, on a cheap Android phone, on a weak signal near the train station.

## Scope

**In:** `/c/*` route group, phone-code login, common routes list, custom order, price preview, order status
and live tracking, cancel, history, rating, "call us" fallback everywhere.
**Out:** card payment, accounts with passwords, multi-fleet switching (fleet comes from the subdomain).

## Entry points

- `https://{fleet-slug}.{domain}/` → customer app root. Fleet branding (name, phone, primary color) loaded from `GET /api/v1/public/fleet`.
- Tracking link from SMS: `https://{fleet-slug}.{domain}/c/t/{publicCode}?k={trackingToken}` — opens tracking without login. Tracking token = HMAC of `orderId + expiry`, valid until 2 h after completion. Implement `GET /api/v1/public/track/{code}?k=` returning the reduced DTO (see 01 §6).

## Screens (mobile-first, must also be fine on desktop)

### 1. Home (`/c`)
- Header: fleet name, big **"Zavolat"** button (`tel:` link to fleet phone). This button exists on **every** screen — the phone is always the fallback.
- **Common routes** as the first content block: cards with name, price ("110 Kč"), one tap → goes to Confirm with the route preselected. Only routes valid right now are shown (server filters by time/day). If none, block is hidden.
- Below: **"Vlastní adresa"** button → Custom order.
- If the customer has an active order: sticky banner "Máte aktivní objednávku K7F2A9 – sledovat" replacing the routes block.

### 2. Confirm route order (`/c/order/route/:routeId`)
- Depends on route type:
  - PointToPoint: pickup and dropoff prefilled and locked; only "Kde přesně vás vyzvedneme?" optional note (e.g. "u hlavního vchodu").
  - Zone: pickup address input restricted to the zone (validate on server; show "Tato adresa je mimo zónu" and fall back to estimate with the customer's consent).
  - ZoneToZone: pickup input (validated in from-zone), dropoff input (validated in to-zone).
- When: **Hned** (default) / **Na čas** (date-time picker, min +20 min, max +7 days).
- Passengers 1–4 (+ "více, zavolejte" link).
- Price shown big and fixed: "Cena 110 Kč – pevná".
- **"Objednat"** → if not logged in, inline phone → SMS code step (do not lose form state) → creates order → Tracking screen.

### 3. Custom order (`/c/order/new`)
- Pickup: address autocomplete (`/api/v1/geo/suggest`) + **"Použít moji polohu"** (reverse geocode) + map pin drag as a fallback.
- Dropoff: same, optional ("Řeknu řidiči").
- Price preview from `/api/v1/pricing/quote` (06 provides route matching; until then use tariff estimate). Shows either "Cena 300 Kč – pevná" or "Odhad 180–220 Kč" (estimate ± 10 %, rounded to 10). Never show a single exact number for an estimate.
- When / passengers / note as above. **"Objednat"** as above.

### 4. Login step (inline, `/c/login` when standalone)
- Phone input with +420 default. Send code. 6-digit input with auto-submit. Resend after 60 s. Errors in plain Czech ("Kód nesouhlasí, zkuste to znovu").
- On success store tokens; never ask again on this device unless refresh fails.

### 5. Tracking (`/c/t/:code`)
- Status headline in human words, one line, large:
  - New: "Hledáme řidiče…"
  - Assigned/Accepted: "Řidič Petr přijede za ~6 min" (ETA from OSRM driver→pickup, refreshed every 15 s)
  - Arrived: "Řidič je na místě" + car plate and color prominently
  - InProgress: "Jedete" + dropoff
  - Completed: "Hotovo – 110 Kč" + rating prompt
  - Cancelled: reason in customer-friendly words + "Zavolat"
- Map with the car (via `Subscribe(orderId)` on SignalR) and pickup pin. If SignalR fails, poll `GET /public/track` every 10 s.
- Details collapsed below: code, addresses, time, price, driver first name, vehicle.
- **"Zrušit objednávku"** — allowed in New/Assigned/Accepted; confirm dialog with two buttons; after Accepted show hint "Řidič už jede, prosíme zrušte jen v nutném případě".
- Push notification subscription prompt after first order ("Chcete dostat upozornění, až řidič dorazí?").

### 6. Rating (on Tracking after Completed)
1–5 stars + optional comment. `POST /api/v1/orders/{id}/rating` (add endpoint: customer-only, once per order, stores on Order: `RatingStars`, `RatingComment`, `RatedAt` — add migration). Dispatcher sees rating in order detail (small change in 02).

### 7. History (`/c/history`)
List of past orders with date, route/addresses, price, status. Tap → Tracking screen in read-only mode. "Objednat znovu" copies addresses into Custom order.

## Behavior rules

- Everything must work without notifications and without location permission; those are enhancements.
- First load under 3 s on a slow 3G profile (Lighthouse). Route the map tiles lazily; the home screen must not wait for Leaflet.
- Offline: home shows cached routes and the "Zavolat" button; ordering is disabled with the message "Jste offline – zavolejte nám" and the phone number.
- No dark patterns: cancel is easy to find, price is always visible before ordering.
- Formal Czech ("vy").

## Acceptance criteria

1. Playwright (mobile): fresh visitor taps a common route → Objednat → enters phone + code (dev code from console/API) → lands on Tracking with "Hledáme řidiče…". Exactly 3 taps before the phone step.
2. Dispatcher assigns and driver accepts via API → Tracking headline updates to ETA without reload; car marker moves when driver sends positions.
3. Tracking link with valid token works logged-out; with an expired token shows "Odkaz vypršel" and the call button.
4. Custom order shows an estimate range, never an exact estimate.
5. Cancel in Accepted state shows the hint and, on confirm, the order is Cancelled with reason `customer` and the driver's app returns to Home (verify via 03's state).
6. Lighthouse mobile: Performance ≥ 85, PWA installable, Accessibility ≥ 90.
7. Rating stored and visible in dispatcher order detail.
