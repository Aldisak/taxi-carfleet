# Assignment 02 — Dispatcher web app

Read `00-PROJECT-CONTEXT.md` first. Requires Assignment 01 merged.

## Goal

The screen the person who answers the phone uses all day. It replaces a paper notebook.
**Speed of creating an order from a phone call is the #1 metric: under 20 seconds.**

## Scope

**In:** the `/x/*` route group of the React app, dispatcher layout, order creation, order board, live map,
driver panel, assign/reassign/cancel, scheduled orders, order detail with events, basic settings (vehicles, staff).
**Out:** route/zone management (06), reports (07), customer-facing anything.

## Screens

### 1. Login (`/x/login`)
Fleet slug (prefilled from subdomain), email, password. Remember fleet slug in localStorage. Errors in Czech.

### 2. Board (`/x`) — the main screen, desktop-first (≥ 1280 px)
Three-column layout, no navigation away needed for normal work:

**Left column — New order form (always visible, never a modal)**
- Fields in this order, one tab-stop each: Phone → Name (optional, auto-filled if phone is known from past orders) → Pickup → Dropoff (optional) → When (ASAP / time picker) → Passengers → Note.
- Pickup/dropoff: address autocomplete (Mapy.com suggest via backend proxy `/api/v1/geo/suggest?q=`), plus **quick chips** for the fleet's most used places (train station Kolín, train station KH, hospital, bus station — configurable later in 06; hardcode from fleet settings JSON for now). Clicking a chip fills the field with coordinates.
- Price preview appears live: fixed route price if matched (call `/api/v1/pricing/quote`, to be implemented in 06 — until then show estimate from tariff × Mapy.com route distance via `POST /api/v1/geo/route`), else estimate.
- Big primary button **"Vytvořit objednávku"** (Enter key submits from any field). After submit the form clears, focus returns to Phone, and the new order appears at the top of the middle column highlighted for 3 s.
- Keyboard shortcut `F2` focuses the form from anywhere.

**Middle column — Active orders**
- Sections: **Nové** (unassigned), **Přiřazené / Čekají na přijetí**, **Probíhající**, **Naplánované (dnes / zítra)**. Collapsed **Dokončené dnes** at the bottom.
- Each order card: public code, time (ASAP or scheduled), customer phone + name, pickup → dropoff (one line each, ellipsized), price (fixed shown as badge "PEVNÁ 110 Kč"), driver name if any, status pill, elapsed time since creation for New orders (turns red after 2 min).
- Card actions: **Assign** (opens inline driver picker sorted by distance to pickup, free drivers first), **Reassign**, **Cancel** (requires reason from a short list + optional text), **Detail**.
- Drag a card onto a driver in the right column = assign. Keep click-based flow as primary; drag is a bonus.
- Real-time: subscribe to `OrderChanged` on SignalR; optimistic update on own actions; reconcile on event. Refetch list on reconnect.

**Right column — Drivers**
- One row per driver: name, vehicle plate, status pill (Volný / Na cestě / Obsazen / Offline), last position age ("před 12 s"), current order code.
- Manual override button "Nastavit stav" for fallback mode (phone-only driver): dispatcher can set Free/Busy/Offline. Logged as AuditLog with actor.
- Click driver → map centers on them.

**Map (toggle to replace the middle column, or a fourth panel on wide screens ≥ 1600 px)**
- Leaflet rendering Mapy.com tiles (browser key + logo + attribution from `GET /geo/config`). Driver markers with heading arrow, colored by status. Order pickup pins for New/Assigned orders. Click pin → highlights card and vice versa.
- Updates from `DriverPositionChanged`. Throttle marker redraw to 1 s.

### 3. Order detail (`/x/orders/:id`, opens as right-side drawer, not a page)
All fields editable while status is New/Assigned (address, time, note, passengers) — edits go through `PATCH /api/v1/orders/{id}` (add this endpoint if 01 didn't; Dispatcher only; allowed only in New/Assigned; writes `NoteAdded`/`Updated` event). Timeline of `order_events` in Czech with actor. Buttons for every allowed transition given current status.

### 4. Search (`/x/orders`)
Table with filters: date range, status, driver, free text (code/phone/name). Default: today. Click row → drawer. Export CSV of the current filter (client-side).

### 5. Settings (`/x/settings`) — FleetAdmin only
Tabs: **Vozidla** (CRUD), **Lidé** (drivers/dispatchers CRUD, reset password), **Fleet** (name, phone, offer timeout, auto-dispatch toggle — disabled with "v1.1" hint). Routes & zones tab is added in 06.

## Behavior rules

- The board must remain usable during a SignalR disconnect: show a yellow "Offline – zobrazuji poslední známý stav" banner, disable actions that require the server, auto-reconnect with backoff, refetch on reconnect.
- Two dispatchers acting on the same order: server 409 → show "Objednávku mezitím změnil někdo jiný" and refresh the card. No silent overwrite.
- Sound: short notification sound when a new app order (Source=App) arrives, and when a driver declines/times out. Mute toggle in header, persisted.
- Never block the New order form with any dialog.

## Acceptance criteria

1. Playwright test: from a fresh login, create an order with phone + pickup (via quick chip) + ASAP in ≤ 6 UI interactions, then assign it to a free driver. Total scripted time excluding network < 20 s.
2. When the seeded driver accepts via API, the card moves to "Probíhající" without page reload within 1 s.
3. Driver position updates move the marker on the map.
4. Cancelling requires a reason; the reason appears in the order timeline.
5. Manual driver status override works and produces an AuditLog row.
6. Board remains readable at 1280×720; no horizontal scroll.
7. All strings in `cs.json`; `en.json` complete as fallback.
8. Lighthouse accessibility ≥ 90 on the board.
