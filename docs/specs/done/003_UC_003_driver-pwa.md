# UC-003 — Driver PWA

- **Sequence:** 003
- **Stack:** mixed — frontend (`/web`, `/d/*` routes + PWA) + backend support (`/api`)
- **Complexity tag:** novel (PWA install/service worker, geolocation, IndexedDB offline queue, idempotency keys)
- **Mode:** autonomous batch run (standing user directive: gates pre-approved, parallel lanes, interrupt only on unresolvable blocks)
- **Sources of truth:** `.claude/state/00-PROJECT-CONTEXT.md` (§4 stack, §8 state machine, §10 SignalR, §11 UX), `.claude/state/03-driver-pwa.md` (screens/behavior/ACs — authoritative, do not restate), `docs/api.md`, `docs/decisions.md`, CLAUDE.md facts.

## Title

Driver PWA: installable `/d/*` mobile app — shift on/off, full-screen order offers with accept/decline, ride status flow, completion with price, position reporting, offline transition queue — plus the backend endpoints it needs.

## Actors

- **Driver** — whole-shift phone app: go online, receive offers, run rides, complete with price/payment.
- **Dispatcher** — (indirectly) assigns orders that become offers; sees truthful driver state.
- **System** — offer timeout job (exists), idempotent replay.

## Preconditions

- UC-001 + UC-002 on `main` (`ff233c2`): backend 255 tests, web 334 tests + Playwright harness, SignalR realtime client infra, i18n discipline, theme. Node 20.0.0 pins binding. Docker running.
- Existing but unused: `IRealtimePublisher.NewOrderOfferedAsync` + hub `NewOrderOffered(dto, expiresAt)` — never called (verified).
- `GET geo/route` exists but is DispatcherOnly; drivers need it for distance/ETA to pickup.

## Main flow (system level)

**Lane A — backend (api/, parallel to Lane B):**
1. **Offer publishing:** Assign + Reassign transitions publish `NewOrderOffered` to the (new) driver with `expiresAt = now + fleet.OfferTimeoutSeconds` (FleetSettings; default 45). Publish after commit alongside OrderChanged (OrderService owns it — the transition result already knows the offered driver).
2. **Idempotency keys:** `X-Idempotency-Key` header support on the driver transition endpoints (accept/decline/arrive/start/complete/cancel): new `IdempotencyRecord` entity (Key unique per user, RequestHash, ResponseStatus, ResponseBody jsonb, CreatedAt; 24 h window; migration `AddIdempotencyRecords`) + a FastEndpoints pre-processor or endpoint-level helper — same key within 24 h returns the stored response without re-executing; concurrent duplicate → single execution (unique-index claim like the refresh-token pattern). Cleanup piggybacks on an existing job or a small purge in the check (decide, document).
3. **Driver summary + history:** `GET drivers/me/summary?date=` (rides count, cash/card/invoice totals in CZK, hours online from DriverShifts) and `GET drivers/me/orders?date=` (driver's own rides, DriverOnly, tenant+driver-scoped, read-only list for History screen).
4. **Geo access:** widen `geo/route` policy to Dispatcher OR Driver (new policy or additional policy on the endpoint — respect existing conventions; suggest DispatcherOrDriver policy constant).

**Lane B — frontend (web/, sequential):**
5. **PWA foundation:** vite-plugin-pwa (Node-20-compatible version) + manifest (icons incl. maskable, splash, name "Taxi Řidič", theme color), service worker (app-shell precache; NO api caching beyond safe GETs; keep Workbox config minimal), custom install banner (`beforeinstallprompt`), permission priming screens (location + notifications with one-sentence explanations).
6. **Driver login** (`/d/login`): reuse auth with driver-role landing; "Zůstat přihlášen" → refresh token in IndexedDB; **silent refresh** (proactive refresh before access-token expiry + retry-on-401-then-refresh in the api client; never logged out mid-shift).
7. **Home** (`/d`): giant status button state machine (Offline→"Začít směnu" requires vehicle selected + location permission; Free→"Ukončit směnu" + waiting text), vehicle selector (offline only), connection dot (SignalR state), today summary chips (drivers/me/summary).
8. **Offer takeover:** on `NewOrderOffered` — full-screen, repeating loud sound + vibration (respect per-driver "Tichý režim" setting, default OFF), pickup large, distance/ETA via geo/route, price badge (PEVNÁ green / Odhad grey / Taxametr), countdown ring to expiresAt, Přijmout (64 px) / Odmítnout with reason (Daleko / Mám pauzu / Jiný důvod → decline reason), double-tap guard (single request), expiry auto-dismiss. Accept/decline are live-only (no offline queue; "Bez připojení, zkuste znovu").
9. **Active ride** (`/d/ride`): status-driven big button (Accepted: Navigovat via geo:/maps links per settings + "Jsem na místě"; Arrived: "Zahájit jízdu" + "Zákazník nepřišel" enabled only after 5-min timer; InProgress: "Navigovat k cíli" + "Ukončit jízdu"), customer phone tap-to-call, collapsible Leaflet map strip, state restore from IndexedDB + reconcile with GET drivers/me + GET orders/{id} on load (AC #6).
10. **Complete** (`/d/ride/complete`): Fixed → locked prefilled price + "Změnit cenu" reveal with ≥5-char reason; Estimate/Meter → big numeric keypad prefilled; payment toggles Hotově/Kartou/Faktura; success → Home with "Hotovo ✓".
11. **Position reporting:** while online, `watchPosition` (high accuracy) → hub `UpdatePosition` every 3 s OR >25 m moved (client throttle; server throttles too), heading+speed included; Wake Lock on ride screens; red "Poloha se neodesílá" banner + single vibration when nothing sent for 60 s; degradation notes measured→`docs/driver-pwa-limits.md`.
12. **Offline queue:** IndexedDB queue for arrive/start/complete/no-show-cancel with idempotency keys, ordered replay on reconnect, "čeká na odeslání" indicators, exactly-once via server idempotency (AC #5).
13. **History + Settings** (`/d/history`, `/d/settings`): history read-only with per-payment totals; settings: nav app preference, silent mode, logout, version, Diagnostika panel (location/push permission states, last position sent, SignalR state).
14. **E2E (mobile viewport):** AC #2 full flow (start shift → offer via dispatcher API assign → accept → arrive → start → complete fixed → home totals) + AC #5 offline queue (context.setOffline around "Jsem na místě", replay exactly-once) + AC #4 decline returns order to New.

## Acceptance criteria

The 8 in `.claude/state/03-driver-pwa.md` are binding, with one recorded scope amendment: **AC #3's push-notification half is DEFERRED to assignment 05** (Web Push infrastructure belongs to 05; foreground ≤2 s offer display is fully in scope and E2E-tested). Record in docs/decisions.md.

## Out of scope

Payments, chat, route management, native wrapper, Web Push sending (05 — including the backgrounded-offer push trigger), PWA for `/x` dispatcher routes.

## Non-functional requirements

- Mobile-only portrait ≥360 px for /d; touch targets ≥48 px, primary buttons ≥64 px (AC #7); one-handed.
- All strings cs.json + en parity (AC #8); Czech informal "ty" acceptable for drivers per context §11.
- Quality gate (blocking): api build -warnaserror + test; web tsc + eslint --max-warnings 0 + vitest + playwright (incl. new driver specs). Informational: format checks.
- Conventions: UC-002 frontend conventions continue; /d features under web/src/features/driver*, shared code reused (api client, realtime, i18n, theme — extend, don't fork); backend per .claude/rules.

## Notes for the designer

- Two lanes again: Lane A WIs mostly independent BUT idempotency (A2) touches transition endpoints — keep A1 (offer publish) and A2 (idempotency) serialized if they share OrderService/endpoint files; A3/A4 independent. Mark `lane` per WI; same staging discipline (api/ vs web/).
- Lane B sequential; PWA foundation first (B1), then login/home/offer/ride/complete/position/queue/history+settings/E2E. The offline queue (B7-ish) and position reporting are the risky WIs — design their testability explicitly (fake IndexedDB via fake-indexeddb? vitest jsdom constraints; geolocation mocked; wake lock feature-detected).
- Playwright mobile viewport: reuse the UC-002 harness (webServer scripts exist); driver spec file additive. Sound/vibration: feature-detect, no-op in tests.
- verification.tool enum as UC-002 (dotnet-test|dotnet-build|npm-lint|npm-tsc|vitest|playwright).
- The service worker must NOT break the existing /x app or the dispatcher E2E — scope the PWA to the shared shell carefully (one manifest is fine; SW precache must not cache /api or /hubs).
