# Assignment 03 — Driver PWA

Read `00-PROJECT-CONTEXT.md` first. Requires 01 and 02 merged.

## Goal

A phone app a driver keeps open on the dashboard for a whole shift. It must be **obvious, big, loud, and honest**.
If the app says a driver is "Free", the dispatcher must be able to trust it.

## Scope

**In:** `/d/*` route group, installable PWA, shift on/off, order offer with accept/decline, ride status flow,
navigation handoff, completion with price, today's summary, background position reporting, offline queue.
**Out:** payments, chat, route management.

## Screens (mobile only, portrait, ≥ 360 px wide)

### 1. Login (`/d/login`)
Fleet slug (prefilled), email, password, "Zůstat přihlášen" (refresh token in IndexedDB). After login, prompt to install the PWA (custom banner using `beforeinstallprompt`) and to allow notifications and location. Explain in one sentence each why.

### 2. Home (`/d`)
- Top: driver name, vehicle selector (only when offline), connection dot (green/yellow/red).
- Center: giant status button.
  - Offline → **"Začít směnu"** (green). Requires a vehicle selected and location permission. Calls `POST /drivers/me/online`.
  - Free → **"Ukončit směnu"** (grey, secondary) + text "Čekám na objednávku".
  - Busy states → replaced by the Active ride screen.
- Bottom: today's summary chips: rides, cash total, card total, hours online.

### 3. Order offer (full-screen takeover)
Triggered by `NewOrderOffered`. Also triggered by push notification when the app is backgrounded; opening the notification opens this screen.
- Plays a loud repeating sound + vibration until answered or expired. Respect phone's silent mode? **No** — drivers ask for loud; add a per-driver toggle "Tichý režim" in settings, default off.
- Shows: pickup address (large), distance to pickup and ETA (from OSRM via backend), dropoff (if any), price badge (**"PEVNÁ 110 Kč"** in green, or "Odhad ~ 180 Kč" in grey, or "Taxametr"), customer name, note, scheduled time if not ASAP.
- Countdown ring showing `expiresAt`.
- Two buttons: **Přijmout** (full width, green, 64 px tall) and **Odmítnout** (small, requires tapping a reason: Daleko / Mám pauzu / Jiný důvod).
- Accepting twice (double tap) must not send two requests.

### 4. Active ride (`/d/ride`)
One screen, one big button that changes with status:
- Accepted → **"Navigovat"** (opens Google Maps / Mapy.cz / Waze via `geo:` and universal links; preference in settings) and **"Jsem na místě"**.
- Arrived → **"Zahájit jízdu"**; secondary: **"Zákazník nepřišel"** (cancel, reason no-show, allowed only after 5 min at pickup — show timer).
- InProgress → **"Navigovat k cíli"** (if dropoff known) and **"Ukončit jízdu"**.
- Always visible: customer phone (tap to call), pickup/dropoff, price badge, note.
- Small map strip at the top with own position and pickup/dropoff pins (Leaflet, can be collapsed).

### 5. Complete ride (`/d/ride/complete`)
- If PriceType = Fixed: price prefilled and locked; "Změnit cenu" reveals input + mandatory reason (min 5 chars) → sent as `overrideReason`.
- If Estimate/Meter: numeric keypad input (big keys), prefilled with estimate.
- Payment type: three big toggles — **Hotově / Kartou / Faktura**.
- **"Dokončit"** → `POST /orders/{id}/complete`. On success return to Home with a 2-second "Hotovo ✓" confirmation.

### 6. History (`/d/history`)
Today by default, previous days selectable. List of rides with price and payment type. Totals per payment type. Read-only.

### 7. Settings (`/d/settings`)
Navigation app preference, silent mode, logout, app version, "Diagnostika" (shows location permission state, push permission state, last position sent, SignalR state — the dispatcher will ask drivers to read this aloud on the phone).

## Position reporting

- While online: `watchPosition` with `enableHighAccuracy`, send via SignalR `UpdatePosition` every 3 s **or** when moved > 25 m, whichever first. Include heading and speed.
- Backgrounding: browsers throttle background geolocation. Mitigations, in this order: (a) Wake Lock API while on ride screens, (b) ask user to keep app in foreground (banner), (c) document in `docs/driver-pwa-limits.md` what was measured on Android Chrome and iOS Safari so we can decide on a native shell later. **Do not attempt a native wrapper in this assignment.**
- If no position could be sent for 60 s while online, show a red banner "Poloha se neodesílá" and vibrate once.

## Offline & reliability

- Status transitions (arrive/start/complete) are queued in IndexedDB when offline and replayed in order on reconnect. Each has an idempotency key (`X-Idempotency-Key` header — add server support: same key within 24 h returns the original response).
- Accept/decline are **not** queued — they need a live server. Show "Bez připojení, zkuste znovu" instead.
- App state (current order, status) survives page reload and phone restart (persist to IndexedDB, reconcile with `GET /drivers/me` on start).
- Session refresh is silent. A driver must never be logged out mid-shift by token expiry.

## Acceptance criteria

1. Installable on Android Chrome and iOS Safari; passes PWA installability checks; app icon and splash present.
2. Playwright (mobile viewport): start shift → receive offer (triggered via API as dispatcher) → accept → arrive → start → complete with fixed price → home shows 1 ride and correct totals.
3. Offer screen appears within 2 s of assignment when the app is in the foreground; push notification arrives when backgrounded (tested manually, steps in `DEMO.md`).
4. Declining requires a reason; the order returns to New for the dispatcher within 1 s.
5. Simulated offline (Playwright `context.setOffline`) during "Jsem na místě" → action is queued, shown as "čeká na odeslání", and delivered after reconnect exactly once.
6. Killing the tab mid-ride and reopening restores the Active ride screen.
7. All touch targets ≥ 48 px; primary buttons ≥ 64 px tall; works one-handed.
8. All strings in `cs.json`.
